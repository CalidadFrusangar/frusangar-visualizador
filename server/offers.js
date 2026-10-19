// Ofertas de las tarifas de Odoo (product.pricelist.item), solo lectura. Sin precios: en planta se
// enseña qué hay en oferta, para quién y cuándo se sirve.
//
// Es oferta una regla con «Tipo de precio» = Oferta (x_studio_tipo_de_precio, solo existe en
// producción) o, si está vacío, una regla con fecha de fin o con ventana de entrega
// (x_studio_fecha_inicio_entrega → x_studio_fecha_final_entrega_1). Las marcadas «Tarifa» no lo son.
// Mismo criterio que el aviso de Odoo (13. Modulos personalizados odoo generales/aviso_precio_tarifa).
// La lógica de en vigor / próximas / terminadas viene de «3. Visualizador ofertas + historico»
// (server.js, getOfferRows).
const { executeKw } = require('./odoo');
const { madridDateStr, addDays, fromOdooUtc } = require('./dates');

const UPCOMING_DAYS = 14;  // «Próximas»: empiezan en los próximos 14 días
const ENDED_DAYS = 7;      // «Terminadas»: acabaron en los últimos 7 días
const CUSTOMERS_TTL_MS = 10 * 60 * 1000;

const BASE_FIELDS = ['pricelist_id', 'applied_on', 'product_tmpl_id', 'product_id', 'categ_id', 'compute_price',
  'date_start', 'date_end', 'x_studio_fecha_inicio_entrega', 'x_studio_fecha_final_entrega_1', 'write_date'];
const OPTIONAL_FIELDS = ['x_studio_tipo_de_precio', 'x_studio_comentario'];

let fieldsCache = null; // fields of product.pricelist.item that exist in this database

async function availableFields() {
  if (!fieldsCache) {
    const all = await executeKw('product.pricelist.item', 'fields_get', [], { attributes: ['type'] });
    fieldsCache = new Set(Object.keys(all));
  }
  return fieldsCache;
}

const cleanName = (name) => (name || '').replace(/^\[[^\]]*\]\s*/, '');
const many2one = (v) => (Array.isArray(v) ? { id: v[0], name: v[1] } : null);

// Window of an offer as Madrid dates 'YYYY-MM-DD' (null = open). The delivery window wins; otherwise the
// rule validity: date_start is 00:00 Madrid in UTC and date_end is 00:00 Madrid of the day AFTER the last.
function offerWindow(item) {
  const start = item.x_studio_fecha_inicio_entrega
    || (item.date_start ? madridDateStr(fromOdooUtc(item.date_start)) : null);
  const end = item.x_studio_fecha_final_entrega_1
    || (item.date_end ? madridDateStr(new Date(fromOdooUtc(item.date_end).getTime() - 1000)) : null);
  return { start: start || null, end: end || null };
}

function isOffer(item) {
  const type = item.x_studio_tipo_de_precio || null;
  if (type === 'Oferta') return true;
  if (type) return false; // «Tarifa»
  return !!(item.date_end || item.x_studio_fecha_final_entrega_1);
}

// Pure: Odoo rules → offers with status ('vigente' | 'proxima' | 'terminada'), or left out
function classifyOffers(items, today, { pricelistNames = {}, customersByPricelist = {} } = {}) {
  const offers = [];
  for (const item of items) {
    if (!isOffer(item)) continue;
    const { start, end } = offerWindow(item);
    const badDates = !!(start && end && end < start);
    const issue = badDates ? 'Fechas incoherentes: el fin es anterior al inicio'
      : !start && !end ? 'Marcada como oferta pero sin fechas' : null;
    let status = null;
    if (badDates) {
      // Bad end date: classify by its start only
      if (start <= today) status = start >= addDays(today, -ENDED_DAYS) ? 'vigente' : null;
      else if (start <= addDays(today, UPCOMING_DAYS)) status = 'proxima';
    } else if ((!start || start <= today) && (!end || end >= today)) status = 'vigente';
    else if (start && start > today && start <= addDays(today, UPCOMING_DAYS)) status = 'proxima';
    else if (end && end < today && end >= addDays(today, -ENDED_DAYS)) status = 'terminada';
    if (!status) continue;

    const pricelist = many2one(item.pricelist_id);
    const product = many2one(item.product_id) || many2one(item.product_tmpl_id);
    const category = many2one(item.categ_id);
    offers.push({
      id: item.id,
      status,
      start,
      end,
      issue,
      badDates,
      unclassified: item.x_studio_tipo_de_precio !== 'Oferta',
      comment: item.x_studio_comentario || '',
      pricelistId: pricelist?.id || null,
      pricelist: pricelistNames[pricelist?.id] || (pricelist?.name || '').replace(/\s*\(EUR\)$/, ''),
      customers: customersByPricelist[pricelist?.id] || [],
      appliedOn: item.applied_on,
      productId: many2one(item.product_id)?.id || null,
      productTmplId: many2one(item.product_tmpl_id)?.id || null,
      categId: category?.id || null,
      product: product ? cleanName(product.name) : category ? `Categoría ${category.name}` : 'Todos los productos',
      writeDate: item.write_date,
    });
  }
  const order = { vigente: 0, proxima: 1, terminada: 2 };
  return offers.sort((a, b) => order[a.status] - order[b.status]
    || (a.status === 'terminada' ? (b.end || '').localeCompare(a.end || '') : (a.start || '').localeCompare(b.start || ''))
    || a.pricelist.localeCompare(b.pricelist) || a.id - b.id);
}

// Pricelists that derive from another (rappels «formula sobre otra tarifa»): { pricelistId: basePricelistId }
function pricelistChain(globalItems) {
  const base = {};
  for (const it of globalItems) {
    const pl = many2one(it.pricelist_id)?.id;
    const b = many2one(it.base_pricelist_id)?.id;
    if (pl && b && !(pl in base)) base[pl] = b;
  }
  return base;
}

let customersCache = { at: 0, byPricelist: {} };

// Customer names per pricelist (property_product_pricelist of the companies), cached 10 min
async function customersByPricelist(pricelistIds, now = Date.now()) {
  if (now - customersCache.at < CUSTOMERS_TTL_MS && pricelistIds.every(id => id in customersCache.byPricelist)) {
    return customersCache.byPricelist;
  }
  const byPricelist = Object.fromEntries(pricelistIds.map(id => [id, []]));
  if (pricelistIds.length) {
    const partners = await executeKw('res.partner', 'search_read',
      [[['property_product_pricelist', 'in', pricelistIds], ['parent_id', '=', false], ['customer_rank', '>', 0]]],
      { fields: ['name', 'property_product_pricelist'], limit: 2000 });
    for (const p of partners) {
      const id = p.property_product_pricelist?.[0];
      if (id in byPricelist) byPricelist[id].push(p.name);
    }
    for (const list of Object.values(byPricelist)) list.sort((a, b) => a.localeCompare(b, 'es'));
  }
  customersCache = { at: now, byPricelist };
  return byPricelist;
}

async function fetchOffers(now = new Date()) {
  const today = madridDateStr(now);
  const fields = await availableFields();
  const read = [...BASE_FIELDS, ...OPTIONAL_FIELDS].filter(f => fields.has(f));
  // Candidates: anything with an end date or delivery window, plus those marked «Oferta». Rules that ended
  // long ago are left out in the domain (classifyOffers keeps the last ENDED_DAYS days).
  const since = addDays(today, -ENDED_DAYS - 1);
  const domain = [['pricelist_id.active', '=', true], '|', '|',
    ['date_end', '>=', `${since} 00:00:00`],
    ['x_studio_fecha_final_entrega_1', '>=', since],
    fields.has('x_studio_tipo_de_precio') ? ['x_studio_tipo_de_precio', '=', 'Oferta'] : ['id', '=', 0]];
  const [items, globals] = await Promise.all([
    executeKw('product.pricelist.item', 'search_read', [domain], { fields: read, limit: 2000 }),
    executeKw('product.pricelist.item', 'search_read',
      [[['applied_on', '=', '3_global'], ['compute_price', '=', 'formula'], ['base', '=', 'pricelist'], ['pricelist_id.active', '=', true]]],
      { fields: ['pricelist_id', 'base_pricelist_id'] }),
  ]);
  const chain = pricelistChain(globals);
  // Customers of an offer's pricelist include those on a pricelist derived from it (e.g. «RAPPEL ECOMORA
  // 4,50%» → Ecomora): { offerPricelist: [itself, derived...] }
  const offerPricelists = [...new Set(items.map(i => i.pricelist_id?.[0]).filter(Boolean))];
  const related = Object.fromEntries(offerPricelists.map(id => [id, [id]]));
  for (const pl of Object.keys(chain).map(Number)) {
    let b = pl;
    for (let i = 0; i < 3 && chain[b]; i++) {
      b = chain[b];
      if (related[b] && !related[b].includes(pl)) related[b].push(pl);
    }
  }
  const byPricelist = await customersByPricelist([...new Set(Object.values(related).flat())]).catch(err => {
    console.error('Clientes de las tarifas no disponibles:', err.message.split('\n')[0]);
    return {};
  });
  const customers = Object.fromEntries(Object.entries(related).map(([id, ids]) => [
    id, [...new Set(ids.flatMap(i => byPricelist[i] || []))].sort((a, b) => a.localeCompare(b, 'es')),
  ]));
  return {
    offers: classifyOffers(items, today, { customersByPricelist: customers }),
    chain,
    related,
    today,
    fetchedAt: now.toISOString(),
  };
}

// Pure: which offer applies to an order line. The order's pricelist, or the one it derives from
// (e.g. «Distribución Logística 2,60%» → AHORRAMAS), the product, and the delivery day inside the window.
function offerForLine(offers, chain, pricelistId, line, deliveryDay) {
  if (!pricelistId || !Array.isArray(line.product_id)) return null;
  const lists = [pricelistId];
  for (let i = 0; i < 3 && chain[lists[lists.length - 1]]; i++) lists.push(chain[lists[lists.length - 1]]);
  return offers.find(o => lists.includes(o.pricelistId)
    && ((o.productId && o.productId === line.product_id[0])
      || (!o.productId && o.productTmplId && o.productTmplId === line.productTmplId))
    && !o.badDates
    && (!o.start || o.start <= deliveryDay) && (!o.end || o.end >= deliveryDay)) || null;
}

// Offer info for every product line of the orders (by line id), for the cards
function tagOrders(ordersByDay, offerData) {
  const tags = {};
  if (!offerData?.offers?.length) return tags;
  for (const list of Object.values(ordersByDay)) {
    for (const o of list) {
      const day = madridDateStr(new Date(o.deliveryDate));
      for (const l of o.lines || []) {
        const offer = offerForLine(offerData.offers, offerData.chain || {}, o.pricelist_id?.[0], l, day);
        if (offer) tags[l.id] = { id: offer.id, start: offer.start, end: offer.end, comment: offer.comment };
      }
    }
  }
  return tags;
}

// --- Change detection (pure) ---

const offerSnapshot = (o) => ({
  id: o.id, status: o.status, start: o.start, end: o.end, product: o.product, pricelist: o.pricelist,
  customers: o.customers, comment: o.comment, writeDate: o.writeDate,
});

const fmtDay = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');

function windowText(o) {
  if (o.start && o.end) return `del ${fmtDay(o.start)} al ${fmtDay(o.end)}`;
  if (o.end) return `hasta el ${fmtDay(o.end)}`;
  if (o.start) return `desde el ${fmtDay(o.start)}`;
  return 'sin fechas';
}

const whoText = (o) => (o.customers?.length
  ? o.customers.slice(0, 2).join(', ') + (o.customers.length > 2 ? ` y ${o.customers.length - 2} más` : '')
  : o.pricelist);

function offerEvent(type, o, now, extra = {}) {
  const text = {
    OFERTA_NUEVA: `Nueva oferta: ${o.product} · ${windowText(o)}`,
    OFERTA_CAMBIADA: `Oferta cambiada: ${o.product} · ${windowText(o)}`,
    OFERTA_EMPIEZA: `Empieza hoy la oferta: ${o.product} · ${windowText(o)}`,
    OFERTA_TERMINADA: `Terminó la oferta: ${o.product} (${windowText(o)})`,
  }[type];
  const priority = type === 'OFERTA_TERMINADA' ? 'info' : 'normal';
  return {
    id: `oferta-${o.id}-${now.getTime()}-${type}`,
    ts: now.toISOString(),
    kind: 'oferta',
    offerId: o.id,
    orderId: null,
    orderName: '🏷 Oferta',
    partner: whoText(o),
    dayLabel: windowText(o),
    priority,
    changes: [{ type, text, priority, ...extra }],
    summary: text,
  };
}

// Events between the previous offer snapshot ({ id: snapshot }) and the current offers.
// Null previous snapshot = first run: no events.
function diffOffers(prev, offers, now = new Date()) {
  if (!prev) return [];
  const events = [];
  for (const o of offers) {
    const p = prev[o.id];
    if (!p) {
      if (o.status !== 'terminada') events.push(offerEvent('OFERTA_NUEVA', o, now));
      continue;
    }
    if (p.start !== o.start || p.end !== o.end || p.product !== o.product || p.pricelist !== o.pricelist) {
      events.push(offerEvent('OFERTA_CAMBIADA', o, now));
    } else if (p.status === 'proxima' && o.status === 'vigente') {
      events.push(offerEvent('OFERTA_EMPIEZA', o, now));
    } else if (p.status === 'vigente' && o.status === 'terminada') {
      events.push(offerEvent('OFERTA_TERMINADA', o, now));
    }
  }
  return events;
}

const snapshotOf = (offers) => Object.fromEntries(offers.map(o => [o.id, offerSnapshot(o)]));

module.exports = {
  fetchOffers, classifyOffers, offerWindow, isOffer, availableFields, pricelistChain, offerForLine, tagOrders,
  diffOffers, snapshotOf, windowText,
};
