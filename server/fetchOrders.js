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

  // Delivery date = commitment_date, or expected_date when commitment_date is empty
  const domain = [
    ['type_id', 'in', ORDER_TYPES],
    ['state', 'in', ['sale', 'done', 'cancel']],
    '|',
    '&', ['commitment_date', '>=', from], ['commitment_date', '<', to],
    '&', '&', ['commitment_date', '=', false], ['expected_date', '>=', from], ['expected_date', '<', to],
  ];

  const orders = await executeKw('sale.order', 'search_read', [domain],
    { fields: ORDER_FIELDS, order: 'commitment_date asc, id asc' });

  const lineIds = orders.flatMap(o => o.order_line);
  const pickingIds = orders.flatMap(o => o.picking_ids || []);

  const [lines, pickings] = await Promise.all([
    lineIds.length ? executeKw('sale.order.line', 'read', [lineIds, LINE_FIELDS]) : [],
    pickingIds.length ? executeKw('stock.picking', 'read', [pickingIds, PICKING_FIELDS]) : [],
  ]);

  const linesByOrder = new Map();
  for (const l of lines) {
    const id = l.order_id[0];
    if (!linesByOrder.has(id)) linesByOrder.set(id, []);
    linesByOrder.get(id).push(l);
  }
  const pickingById = new Map(pickings.map(p => [p.id, p]));
  const boxesById = await boxesByPicking(pickings);

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
    days: days.map(d => ({ key: d.key, date: d.date })),
    windowStart: days[0].startUtc.toISOString(),
    windowEnd: days[days.length - 1].endUtc.toISOString(),
    orders: result,
  };
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

module.exports = { fetchOrdersByDay, fetchOrderStatus, pickingStatus, ORDER_TYPES };
