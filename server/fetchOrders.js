const { executeKw } = require('./odoo');
const { boxesByPicking, boxStatus } = require('./boxes');
const { madridDayRanges, toOdooUtc, fromOdooUtc } = require('./dates');

// 1 = Navalcarnero, 5 = Mercamadrid Interno (produced in Navalcarnero)
const ORDER_TYPES = [1, 5];

const ORDER_FIELDS = ['name', 'partner_id', 'expected_date', 'commitment_date', 'order_line',
  'state', 'type_id', 'picking_ids', 'write_date', 'date_order'];
const LINE_FIELDS = ['product_id', 'product_uom_qty', 'product_uom', 'name', 'order_id',
  'product_packaging_id', 'product_packaging_qty', 'palet_id', 'palet_qty', 'display_type', 'sequence'];
const PICKING_FIELDS = ['name', 'state', 'picking_type_code', 'date_done', 'sale_id',
  'x_cajas_declaradas', 'x_cajas_declaracion', 'write_date'];

// Orders without commitment date: how far back (by order date) to look for an expected date in the window
const NO_COMMITMENT_LOOKBACK_DAYS = 60;

// Read records in batches: from Render, big XML-RPC requests have stalled until Odoo timed out
const READ_BATCH = 100;

async function readInBatches(model, ids, fields) {
  const result = [];
  for (let i = 0; i < ids.length; i += READ_BATCH) {
    result.push(...await executeKw(model, 'read', [ids.slice(i, i + READ_BATCH), fields]));
  }
  return result;
}

// Product weight (field «Peso», kg per unit of the product's UoM), cached 10 min
const WEIGHT_TTL_MS = 10 * 60 * 1000;
const weightCache = new Map(); // productId -> { weight, uomId, at }

async function productWeights(productIds, now = Date.now()) {
  const missing = productIds.filter(id => !(weightCache.get(id)?.at > now - WEIGHT_TTL_MS));
  if (missing.length) {
    const products = await executeKw('product.product', 'read', [missing], { fields: ['weight', 'uom_id'], context: { active_test: false } });
    for (const p of products) weightCache.set(p.id, { weight: Number(p.weight) || 0, uomId: p.uom_id?.[0], at: now });
  }
  return weightCache;
}

// Kilos of a line: qty × product weight when the line uses the product's UoM; lines in Kg are already kilos.
// null when unknown (no weight, or a different UoM)
function lineKg(line, weights) {
  if (line.display_type || !Array.isArray(line.product_id)) return null;
  const qty = Number(line.product_uom_qty) || 0;
  const uomName = Array.isArray(line.product_uom) ? line.product_uom[1] : '';
  if (/^kg$/i.test(uomName.trim())) return qty;
  const w = weights.get(line.product_id[0]);
  if (!w || !w.weight || (w.uomId && Array.isArray(line.product_uom) && line.product_uom[0] !== w.uomId)) return null;
  return Math.round(qty * w.weight * 100) / 100;
}

// Validado: all outgoing pickings done; Parcial: some done; Pendiente: none done
function pickingStatus(pickings) {
  const outgoing = pickings.filter(p => p.picking_type_code === 'outgoing' && p.state !== 'cancel');
  if (outgoing.length === 0) return 'pendiente';
  const done = outgoing.filter(p => p.state === 'done').length;
  if (done === outgoing.length) return 'validado';
  return done > 0 ? 'parcial' : 'pendiente';
}

async function fetchOrdersByDay(now = new Date()) {
  const days = madridDayRanges(now);
  const from = toOdooUtc(days[0].startUtc);
  const to = toOdooUtc(days[days.length - 1].endUtc);

  // Delivery date = commitment_date, or expected_date when commitment_date is empty.
  // expected_date is computed (not stored) and Odoo ignores it in a domain: filtering on it brought back
  // every order without commitment date (2,655 orders / 14,126 lines on 16/10/2026) and Render ran out of
  // memory. Those orders are narrowed by date_order instead and checked against expected_date below.
  const orderedFrom = toOdooUtc(new Date(days[0].startUtc.getTime() - NO_COMMITMENT_LOOKBACK_DAYS * 86400000));
  const domain = [
    ['type_id', 'in', ORDER_TYPES],
    ['state', 'in', ['sale', 'done', 'cancel']],
    '|',
    '&', ['commitment_date', '>=', from], ['commitment_date', '<', to],
    '&', '&', ['commitment_date', '=', false], ['date_order', '>=', orderedFrom], ['date_order', '<', to],
  ];

  const found = await executeKw('sale.order', 'search_read', [domain],
    { fields: ORDER_FIELDS, order: 'commitment_date asc, id asc' });
  const inWindow = (o) => {
    const date = o.commitment_date || o.expected_date;
    if (!date) return false;
    const d = fromOdooUtc(date);
    return d >= days[0].startUtc && d < days[days.length - 1].endUtc;
  };
  const orders = found.filter(inWindow);

  const lineIds = orders.flatMap(o => o.order_line);
  const pickingIds = orders.flatMap(o => o.picking_ids || []);

  const [lines, pickings] = await Promise.all([
    readInBatches('sale.order.line', lineIds, LINE_FIELDS),
    readInBatches('stock.picking', pickingIds, PICKING_FIELDS),
  ]);

  const productIds = [...new Set(lines.filter(l => Array.isArray(l.product_id)).map(l => l.product_id[0]))];
  const weights = productIds.length ? await productWeights(productIds) : new Map();
  for (const l of lines) l.kg = lineKg(l, weights);

  const linesByOrder = new Map();
  for (const l of lines) {
    const id = l.order_id[0];
    if (!linesByOrder.has(id)) linesByOrder.set(id, []);
    linesByOrder.get(id).push(l);
  }
  const pickingById = new Map(pickings.map(p => [p.id, p]));
  const [boxesById, stock] = await Promise.all([boxesByPicking(pickings), finishedStock(productIds)]);

  const result = Object.fromEntries(days.map(d => [d.key, []]));

  for (const o of orders) {
    const deliveryUtc = fromOdooUtc(o.commitment_date || o.expected_date);
    const day = days.find(d => deliveryUtc >= d.startUtc && deliveryUtc < d.endUtc);
    if (!day) continue;

    const orderLines = (linesByOrder.get(o.id) || []).sort((a, b) => (a.sequence - b.sequence) || (a.id - b.id));
    const orderPickings = (o.picking_ids || []).map(id => pickingById.get(id)).filter(Boolean);

    result[day.key].push({
      ...o,
      dayKey: day.key,
      deliveryDate: deliveryUtc.toISOString(),
      lines: orderLines,
      pickings: orderPickings,
      pickingStatus: pickingStatus(orderPickings),
      boxes: boxStatus(orderPickings, boxesById),
    });
  }

  for (const list of Object.values(result)) list.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.id - b.id);

  return {
    days: days.map(d => ({ key: d.key, date: d.date, title: d.title, ...(d.dateTo && { dateTo: d.dateTo }) })),
    windowStart: days[0].startUtc.toISOString(),
    windowEnd: days[days.length - 1].endUtc.toISOString(),
    orders: result,
    stock,
  };
}

// Finished goods already made: stock in «FRU/Ubicacion 4 (Productos terminados)» (and its sublocations),
// per product, in the product's unit (the same unit as the order lines). null if it cannot be read.
const FINISHED_LOCATION_ID = Number(process.env.FINISHED_LOCATION_ID) || 65;

async function finishedStock(productIds) {
  if (!productIds.length) return { locationId: FINISHED_LOCATION_ID, byProduct: {}, manufactured: [] };
  try {
    const [quants, manufactured] = await Promise.all([
      executeKw('stock.quant', 'search_read',
        [[['location_id', 'child_of', FINISHED_LOCATION_ID], ['product_id', 'in', productIds]]],
        { fields: ['product_id', 'quantity', 'reserved_quantity'] }),
      manufacturedProducts(productIds),
    ]);
    const byProduct = {};
    for (const q of quants) {
      const s = (byProduct[q.product_id[0]] ||= { qty: 0, reserved: 0 });
      s.qty += Number(q.quantity) || 0;
      s.reserved += Number(q.reserved_quantity) || 0;
    }
    return { locationId: FINISHED_LOCATION_ID, byProduct, manufactured };
  } catch (err) {
    console.error('Stock almacén 4 no disponible:', err.message.split('\n')[0]);
    return null;
  }
}

// Products made in the plant = those with a bill of materials (all «PATATAS TERMINADAS»).
// Others on the orders (e.g. ABONO, a financial service) never count as «to manufacture». Cached 10 min.
const bomCache = new Map(); // productId -> { hasBom, at }

async function manufacturedProducts(productIds, now = Date.now()) {
  const missing = productIds.filter(id => !(bomCache.get(id)?.at > now - WEIGHT_TTL_MS));
  if (missing.length) {
    const products = await executeKw('product.product', 'read', [missing, ['product_tmpl_id']], { context: { active_test: false } });
    const templates = [...new Set(products.map(p => p.product_tmpl_id[0]))];
    const boms = await executeKw('mrp.bom', 'search_read',
      [['|', ['product_id', 'in', missing], ['product_tmpl_id', 'in', templates]]], { fields: ['product_id', 'product_tmpl_id'] });
    const withBom = new Set(boms.map(b => b.product_tmpl_id[0]));
    for (const p of products) bomCache.set(p.id, { hasBom: withBom.has(p.product_tmpl_id[0]), at: now });
  }
  return productIds.filter(id => bomCache.get(id)?.hasBom);
}

// Current delivery date / state of orders that left the window (date moved, cancelled, deleted...)
async function fetchOrderStatus(ids) {
  if (!ids.length) return [];
  const found = await executeKw('sale.order', 'search_read', [[['id', 'in', ids]]],
    { fields: ['state', 'commitment_date', 'expected_date', 'type_id'], context: { active_test: false } });
  return ids.map(id => {
    const o = found.find(f => f.id === id);
    if (!o) return { id, state: 'eliminado' };
    const date = o.commitment_date || o.expected_date;
    return {
      id,
      state: ['draft', 'sent'].includes(o.state) ? 'presupuesto' : o.state,
      deliveryDate: date ? fromOdooUtc(date).toISOString() : null,
      typeId: Array.isArray(o.type_id) ? o.type_id[0] : null,
    };
  });
}

module.exports = { fetchOrdersByDay, fetchOrderStatus, pickingStatus, lineKg, ORDER_TYPES };
