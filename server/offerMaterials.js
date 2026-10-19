// Semáforo de material de cada oferta para planta: ¿alcanza lo que hay para servir la oferta?
// TODO SON ESTIMACIONES. Solo lectura.
//
// Versión simplificada del cálculo del panel 9 (Y:\Desarrollos\9. Indicadores productividad,
// core/ofertas.py + pipeline/extract_ofertas.py), que es el que decide cuándo y cuánto pedir.
// Aquí no hay plazos de proveedor: solo si el material alcanza hasta el fin de la oferta.
// - Venta estimada: lo vendido por día en ofertas anteriores (mismo producto y tarifa, último año);
//   si no hubo, venta normal de 28 días × 2. Nunca menos de lo ya pedido.
// - Lista de materiales: la que nombra al cliente o la tarifa («01CH3C CARREFOUR»); si no, la más
//   usada en fabricación. En Odoo hay una por cliente (cada uno lleva su caja).
// - Material: stock de Navalcarnero + compras en camino − gasto normal (fabricaciones de 28 días)
//   − lo de la oferta. Se acaba antes del fin → «falta»; en la semana siguiente → «justo».
// - Cajas y palés de pool sin stock ni consumo en Odoo (CHEP): sin dato, no cuentan como falta.
const { executeKw } = require('./odoo');
const { madridDateStr, addDays } = require('./dates');
const { isOffer, availableFields } = require('./offers');

const NORMAL_DAYS = 28;
const MULTIPLIER = Number(process.env.OFFER_MULTIPLIER) || 2;
const WAREHOUSE_VIEW_ID = Number(process.env.WAREHOUSE_VIEW_ID) || 7; // FRU (Navalcarnero), sin Mercamadrid
const POOL = /IFCO|CPR|CHEP|EURO ?POOL|PALLET/i;
const STOP_WORDS = new Set(['SOCIEDAD', 'COMPRAS', 'GENERAL', 'COOP', 'ESPAÑA', 'MODERNAS']);

const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

let uomCache = null;
async function uoms() {
  if (!uomCache) {
    const list = await executeKw('uom.uom', 'search_read', [[['active', 'in', [true, false]]]], { fields: ['factor', 'category_id'] });
    uomCache = new Map(list.map(u => [u.id, u]));
  }
  return uomCache;
}

function convert(u, qty, from, to) {
  const a = u.get(from), b = u.get(to);
  if (!a || !b || from === to || a.category_id[0] !== b.category_id[0] || !a.factor) return qty;
  return qty / a.factor * b.factor;
}

// Units sold (in each variant's UoM) per variant, by order date, for these pricelists
async function soldByVariant(u, variants, pricelists, from, to) {
  const lines = await executeKw('sale.order.line', 'search_read', [[
    ['product_id', 'in', [...variants.keys()]], ['state', 'in', ['sale', 'done']],
    ['order_id.pricelist_id', 'in', pricelists],
    ['order_id.date_order', '>=', `${from} 00:00:00`], ['order_id.date_order', '<=', `${to} 23:59:59`],
  ]], { fields: ['product_id', 'product_uom_qty', 'product_uom'] });
  const out = new Map();
  for (const l of lines) {
    if (!l.product_uom) continue;
    const id = l.product_id[0];
    out.set(id, (out.get(id) || 0) + convert(u, Number(l.product_uom_qty) || 0, l.product_uom[0], variants.get(id)));
  }
  return out;
}

async function chooseBom(product, names) {
  const fields = ['product_qty', 'product_uom_id', 'code'];
  let boms = await executeKw('mrp.bom', 'search_read', [[['product_id', '=', product.id], ['active', '=', true]]], { fields });
  if (!boms.length) {
    boms = await executeKw('mrp.bom', 'search_read',
      [[['product_tmpl_id', '=', product.product_tmpl_id[0]], ['product_id', '=', false], ['active', '=', true]]], { fields });
  }
  if (boms.length <= 1) return boms[0] || null;
  const words = new Set(names.flatMap(n => n.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' '))
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w)));
  const named = boms.find(b => [...words].some(w => (b.code || '').toUpperCase().includes(w)));
  if (named) return named;
  const ofs = await executeKw('mrp.production', 'search_read', [[['product_id', '=', product.id], ['state', '=', 'done'],
    ['date_finished', '>=', `${addDays(madridDateStr(new Date()), -90)} 00:00:00`]]], { fields: ['bom_id'] });
  const used = new Map();
  for (const o of ofs) if (o.bom_id) used.set(o.bom_id[0], (used.get(o.bom_id[0]) || 0) + 1);
  const top = [...used.entries()].sort((a, b) => b[1] - a[1])[0];
  return (top && boms.find(b => b.id === top[0])) || boms.sort((a, b) => a.id - b.id)[0];
}

// offers: from offers.js (vigente / proxima); related: { pricelistId: [itself, derived...] }
async function materialsForOffers(offers, related, today = madridDateStr(new Date())) {
  const active = offers.filter(o => o.status !== 'terminada' && !o.badDates && (o.productId || o.productTmplId));
  if (!active.length) return {};
  const u = await uoms();
  const pastFields = ['date_start', 'date_end', 'x_studio_fecha_inicio_entrega', 'x_studio_fecha_final_entrega_1',
    ...((await availableFields()).has('x_studio_tipo_de_precio') ? ['x_studio_tipo_de_precio'] : [])];
  const plans = [];
  for (const o of active) {
    const lists = related[o.pricelistId] || [o.pricelistId];
    const variants = await executeKw('product.product', 'search_read',
      [o.productId ? [['id', '=', o.productId]] : [['product_tmpl_id', '=', o.productTmplId]]],
      { fields: ['uom_id', 'product_tmpl_id', 'product_template_attribute_value_ids', 'weight'] });
    if (!variants.length) continue;
    const vmap = new Map(variants.map(v => [v.id, v.uom_id[0]]));
    const normal = await soldByVariant(u, vmap, lists, addDays(today, -NORMAL_DAYS), addDays(today, -1));
    const main = normal.size ? variants.reduce((best, v) => ((normal.get(v.id) || 0) > (normal.get(best.id) || 0) ? v : best)) : variants[0];
    const start = o.start || today;
    const end = o.end || addDays(start, 13);
    const days = dayDiff(end, start) + 1;
    // Previous offers of the same product in the same pricelist (last year)
    const past = await executeKw('product.pricelist.item', 'search_read', [[
      ['pricelist_id', '=', o.pricelistId], ['id', '!=', o.id], ['active', 'in', [true, false]],
      o.productId ? ['product_id', '=', o.productId] : ['product_tmpl_id', '=', o.productTmplId],
      '|', ['date_end', '!=', false], ['x_studio_fecha_final_entrega_1', '!=', false],
    ]], { fields: pastFields });
    let histUnits = 0, histDays = 0;
    for (const p of past) {
      if (!isOffer(p)) continue; // periods marked «Tarifa» are not offers (same as panel 9)
      const ps = p.x_studio_fecha_inicio_entrega || (p.date_start ? madridDateStr(new Date(`${p.date_start.replace(' ', 'T')}Z`)) : null);
      const pe = p.x_studio_fecha_final_entrega_1 || (p.date_end ? madridDateStr(new Date(new Date(`${p.date_end.replace(' ', 'T')}Z`).getTime() - 1000)) : null);
      if (!ps || !pe || pe < ps || pe >= start || pe < addDays(today, -365)) continue;
      histUnits += sum([...(await soldByVariant(u, vmap, lists, ps, pe)).values()]);
      histDays += dayDiff(pe, ps) + 1;
    }
    const ordered = sum([...(await soldByVariant(u, vmap, lists, start, end)).values()]);
    let rate, method;
    if (histDays > 0) { rate = histUnits / histDays; method = 'historial de ofertas'; }
    else if (normal.size) { rate = sum([...normal.values()]) / NORMAL_DAYS * MULTIPLIER; method = `venta normal × ${MULTIPLIER}`; }
    else { rate = 0; method = 'sin datos'; }
    const total = Math.max(rate * days, ordered);
    const from = start > today ? start : today;
    const remainingDays = Math.max(0, dayDiff(end, from) + 1);
    const pending = total * remainingDays / days;
    const bom = await chooseBom(main, [o.pricelist, ...(o.customers || [])]);
    // Bultos per unit as this customer orders it (packaging on its recent order lines, last 90 days)
    const recent = await executeKw('sale.order.line', 'search_read', [[
      ['product_id', '=', main.id], ['state', 'in', ['sale', 'done']], ['order_id.pricelist_id', 'in', lists],
      ['order_id.date_order', '>=', `${addDays(today, -90)} 00:00:00`], ['product_packaging_qty', '>', 0],
    ]], { fields: ['product_uom_qty', 'product_packaging_qty', 'product_uom'], limit: 200 });
    const units = sum(recent.map(l => convert(u, Number(l.product_uom_qty) || 0, l.product_uom[0], main.uom_id[0])));
    const bultosPerUnit = units > 0 ? sum(recent.map(l => Number(l.product_packaging_qty) || 0)) / units : null;
    plans.push({ offer: o, main, bom, pending, from, end, remainingDays, method, total, ordered, bultosPerUnit });
  }

  // Components of every chosen BOM
  const comps = new Map(); // id -> { name, pool }
  const needs = [];        // { offerId, compId, perDay, from, end }
  for (const p of plans) {
    if (!p.bom) continue;
    const per = convert(u, Number(p.bom.product_qty) || 1, p.bom.product_uom_id[0], p.main.uom_id[0]) || 1;
    const attrs = new Set(p.main.product_template_attribute_value_ids || []);
    const lines = await executeKw('mrp.bom.line', 'search_read', [[['bom_id', '=', p.bom.id]]],
      { fields: ['product_id', 'product_qty', 'product_uom_id', 'bom_product_template_attribute_value_ids'] });
    for (const l of lines) {
      const only = l.bom_product_template_attribute_value_ids || [];
      if (only.length && !only.every(a => attrs.has(a))) continue;
      const id = l.product_id[0];
      if (!comps.has(id)) comps.set(id, { name: l.product_id[1].replace(/^\[[^\]]*\]\s*/, ''), uomId: null });
      needs.push({ offerId: p.offer.id, compId: id, qtyLine: Number(l.product_qty) || 0, lineUom: l.product_uom_id[0], per, p });
    }
  }
  if (!comps.size) return Object.fromEntries(plans.map(p => [p.offer.id, { level: 'sin_datos', text: 'Sin lista de materiales', method: p.method }]));
  const ids = [...comps.keys()];
  const [info, locations] = await Promise.all([
    executeKw('product.product', 'read', [ids, ['uom_id', 'categ_id']]),
    executeKw('stock.location', 'search', [[['id', 'child_of', WAREHOUSE_VIEW_ID], ['usage', '=', 'internal']]]),
  ]);
  for (const i of info) Object.assign(comps.get(i.id), { uomId: i.uom_id[0], pool: POOL.test(`${comps.get(i.id).name} ${i.categ_id?.[1] || ''}`) });
  const [quants, moves, buys] = await Promise.all([
    executeKw('stock.quant', 'search_read', [[['product_id', 'in', ids], ['location_id', 'in', locations]]], { fields: ['product_id', 'quantity'] }),
    executeKw('stock.move', 'search_read', [[['product_id', 'in', ids], ['state', '=', 'done'], ['raw_material_production_id', '!=', false],
      ['date', '>=', `${addDays(today, -NORMAL_DAYS)} 00:00:00`]]], { fields: ['product_id', 'product_qty'] }),
    executeKw('purchase.order.line', 'search_read', [[['product_id', 'in', ids], ['order_id.state', 'in', ['purchase', 'done']],
      ['date_order', '>=', `${addDays(today, -60)} 00:00:00`]]], { fields: ['product_id', 'product_qty', 'qty_received'] }),
  ]);
  const stock = new Map(), use = new Map(), coming = new Map();
  for (const q of quants) stock.set(q.product_id[0], (stock.get(q.product_id[0]) || 0) + (Number(q.quantity) || 0));
  for (const m of moves) use.set(m.product_id[0], (use.get(m.product_id[0]) || 0) + (Number(m.product_qty) || 0) / NORMAL_DAYS);
  for (const b of buys) coming.set(b.product_id[0], (coming.get(b.product_id[0]) || 0) + Math.max(0, (Number(b.product_qty) || 0) - (Number(b.qty_received) || 0)));

  // Day by day per component: normal use + every offer that needs it
  const statusOf = new Map();
  for (const id of ids) {
    const c = comps.get(id);
    const mine = needs.filter(n => n.compId === id).map(n => ({
      ...n, perDay: n.p.remainingDays ? n.p.pending * convert(u, n.qtyLine, n.lineUom, c.uomId) / n.per / n.p.remainingDays : 0,
    }));
    const have = Math.max(0, stock.get(id) || 0) + (coming.get(id) || 0);
    const daily = use.get(id) || 0;
    if (c.pool && (stock.get(id) || 0) <= 0 && !daily) { statusOf.set(id, 'sin_dato'); continue; }
    const lastEnd = mine.reduce((m, n) => (n.p.end > m ? n.p.end : m), today);
    let left = have, runsOut = null;
    for (let d = 0; d <= dayDiff(lastEnd, today) + 7; d++) {
      const day = addDays(today, d);
      left -= daily + sum(mine.filter(n => n.p.from <= day && day <= n.p.end).map(n => n.perDay));
      if (left < 0) { runsOut = day; break; }
    }
    statusOf.set(id, { runsOut, lastEnd });
  }

  const result = {};
  for (const p of plans) {
    const mine = [...new Set(needs.filter(n => n.offerId === p.offer.id).map(n => n.compId))];
    const missing = [], tight = [];
    for (const id of mine) {
      const s = statusOf.get(id);
      if (!s || s === 'sin_dato' || !s.runsOut) continue;
      (s.runsOut <= p.end ? missing : tight).push(comps.get(id).name);
    }
    result[p.offer.id] = !p.bom ? { level: 'sin_datos', text: 'Sin lista de materiales', method: p.method }
      : missing.length ? { level: 'falta', text: `Falta: ${missing.join(', ')}`, method: p.method }
        : tight.length ? { level: 'justo', text: `Justo: ${tight.join(', ')}`, method: p.method }
          : { level: 'cubierto', text: 'Material cubierto', method: p.method };
    if (p.method === 'sin datos') result[p.offer.id].text = `Sin historial para estimar la venta · ${result[p.offer.id].text}`;
    // Estimated sale for the card: units of the product (e.g. bags), bultos and kg.
    // Bultos: as the customer orders it (packaging on its recent lines); otherwise by its BOM (bags per box).
    // Kg: the product «Peso» (kg per unit of its UoM), as in fetchOrders.lineKg; lines in Kg are already kilos.
    const perBox = p.bom ? convert(u, Number(p.bom.product_qty) || 1, p.bom.product_uom_id[0], p.main.uom_id[0]) : null;
    const bultos = p.bultosPerUnit ? p.total * p.bultosPerUnit : perBox && perBox > 1 ? p.total / perBox : null;
    const isKg = /^kg$/i.test((p.main.uom_id[1] || '').trim());
    const kg = isKg ? p.total : Number(p.main.weight) > 0 ? p.total * Number(p.main.weight) : null;
    Object.assign(result[p.offer.id], {
      estimate: Math.round(p.total),
      ordered: Math.round(p.ordered),
      uom: p.main.uom_id[1],
      bultos: bultos != null ? Math.round(bultos) : null,
      bultosFrom: p.bultosPerUnit ? 'pedidos' : bultos != null ? 'lista de materiales' : null,
      kg: kg != null ? Math.round(kg) : null,
    });
  }
  return result;
}

module.exports = { materialsForOffers, dayDiff };
