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

// Windows of an offer as Madrid dates 'YYYY-MM-DD' (null = open).
// - ORDER window (what matters, usuario 2026-10-19): the rule validity date_start / date_end. Odoo applies the
//   price by the ORDER date and bills with it. date_start is 00:00 Madrid in UTC; date_end is compared «>=» with
//   the order datetime, and is usually 00:00 Madrid of the day AFTER the last one (hence −1 s).
// - DELIVERY window (information only): x_studio_fecha_inicio_entrega → x_studio_fecha_final_entrega_1.
// start / end = the order window; only when the rule has no validity dates, the delivery window.
function offerWindow(item) {
  const orderStart = item.date_start ? madridDateStr(fromOdooUtc(item.date_start)) : null;
  const orderEnd = item.date_end ? madridDateStr(new Date(fromOdooUtc(item.date_end).getTime() - 1000)) : null;
  const deliveryStart = item.x_studio_fecha_inicio_entrega || null;
  const deliveryEnd = item.x_studio_fecha_final_entrega_1 || null;
  const byOrder = !!(orderStart || orderEnd);
  // As Odoo shows it in «Validity»: the date of date_end. When it is 00:00 Madrid, that day is NOT included
  // (checked in pruebas 2026-10-19: an order at 00:30 of that day already gets the tariff price).
  const validityEnd = item.date_end ? madridDateStr(fromOdooUtc(item.date_end)) : null;
  return {
    start: byOrder ? orderStart : deliveryStart,
    end: byOrder ? orderEnd : deliveryEnd,
    byOrder,
    validityEnd: validityEnd && validityEnd !== orderEnd ? validityEnd : null, // only when it differs from the last day
    orderStart, orderEnd, deliveryStart, deliveryEnd,
  };
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
    const { start, end, byOrder, validityEnd, deliveryStart, deliveryEnd } = offerWindow(item);
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
      start,             // order window (or delivery window when the rule has no validity dates)
      end,
      byOrder,           // false: start/end are the delivery window, the rule has no order dates
      validityEnd,       // end date as Odoo shows it in «Validity» (00:00 of that day: not included), if ≠ end
      deliveryStart,     // information: when it is served
      deliveryEnd,
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
// (e.g. «Distribución Logística 2,60%» → AHORRAMAS), the product, and the ORDER day inside the order window
// (Odoo prices and bills by the order date). Rules without validity dates fall back to the delivery day.
function offerForLine(offers, chain, pricelistId, line, orderDay, deliveryDay = orderDay) {
  if (!pricelistId || !Array.isArray(line.product_id)) return null;
  const lists = [pricelistId];
  for (let i = 0; i < 3 && chain[lists[lists.length - 1]]; i++) lists.push(chain[lists[lists.length - 1]]);
  return offers.find(o => {
    const day = o.byOrder === false ? deliveryDay : orderDay;
    return lists.includes(o.pricelistId)
      && ((o.productId && o.productId === line.product_id[0])
        || (!o.productId && o.productTmplId && o.productTmplId === line.productTmplId))
      && !o.badDates
      && (!o.start || o.start <= day) && (!o.end || o.end >= day);
  }) || null;
}

// Offer info for every product line of the orders (by line id), for the cards
function tagOrders(ordersByDay, offerData) {
  const tags = {};
  if (!offerData?.offers?.length) return tags;
  for (const list of Object.values(ordersByDay)) {
    for (const o of list) {
      const deliveryDay = madridDateStr(new Date(o.deliveryDate));
      const orderDay = o.date_order ? madridDateStr(fromOdooUtc(o.date_order)) : deliveryDay;
      for (const l of o.lines || []) {
        const offer = offerForLine(offerData.offers, offerData.chain || {}, o.pricelist_id?.[0], l, orderDay, deliveryDay);
        if (offer) {
          tags[l.id] = {
            id: offer.id, start: offer.start, end: offer.end, byOrder: offer.byOrder, validityEnd: offer.validityEnd,
            deliveryStart: offer.deliveryStart, deliveryEnd: offer.deliveryEnd, comment: offer.comment,
          };
        }
      }
    }
  }
  return tags;
}

// --- Change detection (pure) ---

const offerSnapshot = (o) => ({
  id: o.id, status: o.status, start: o.start, end: o.end, deliveryStart: o.deliveryStart, deliveryEnd: o.deliveryEnd,
  product: o.product, pricelist: o.pricelist,
  customers: o.customers, comment: o.comment, writeDate: o.writeDate,
});

const fmtDay = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');

function range(start, end) {
  if (start && end) return `del ${fmtDay(start)} al ${fmtDay(end)}`;
  if (end) return `hasta el ${fmtDay(end)}`;
  if (start) return `desde el ${fmtDay(start)}`;
  return 'sin fechas';
}

// «pedidos del 14/10 al 26/10 (último día 25/10) · se sirve del 15/10 al 27/10»: the order window (Validity,
// as Odoo shows it) is the offer
function windowText(o) {
  if (o.byOrder === false) return `se sirve ${range(o.start, o.end)}`;
  const shown = o.validityEnd
    ? `${range(o.start, o.validityEnd)} (último día de pedido ${fmtDay(o.end)})`
    : range(o.start, o.end);
  const delivery = o.deliveryStart || o.deliveryEnd ? ` · se sirve ${range(o.deliveryStart, o.deliveryEnd)}` : '';
  return `pedidos ${shown}${delivery}`;
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
    // Snapshots saved before 2026-10-19 have the delivery window in start/end and no delivery fields:
    // take them as the new baseline instead of announcing every offer as changed
    if (!('deliveryStart' in p)) continue;
    if (p.start !== o.start || p.end !== o.end || p.deliveryStart !== o.deliveryStart || p.deliveryEnd !== o.deliveryEnd
      || p.product !== o.product || p.pricelist !== o.pricelist) {
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
