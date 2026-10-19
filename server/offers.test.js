const test = require('node:test');
const assert = require('node:assert');
const { classifyOffers, offerWindow, isOffer, offerForLine, diffOffers, snapshotOf, pricelistChain } = require('./offers');

const TODAY = '2026-10-19';

const item = (over = {}) => ({
  id: 1,
  pricelist_id: [21, 'AHORRAMAS S.A. (EUR)'],
  applied_on: '1_product',
  product_tmpl_id: [7302, '[01TU5C] PATATAS TODO USO CULINARIO CAJA'],
  product_id: false,
  categ_id: false,
  date_start: false,
  date_end: false,
  x_studio_fecha_inicio_entrega: false,
  x_studio_fecha_final_entrega_1: false,
  x_studio_tipo_de_precio: false,
  ...over,
});

test('isOffer: «Oferta» yes, «Tarifa» no, empty type only with dates', () => {
  assert.strictEqual(isOffer(item({ x_studio_tipo_de_precio: 'Oferta' })), true);
  assert.strictEqual(isOffer(item({ x_studio_tipo_de_precio: 'Tarifa', date_end: '2026-10-30 23:00:00' })), false);
  assert.strictEqual(isOffer(item({ date_end: '2026-10-30 23:00:00' })), true);
  assert.strictEqual(isOffer(item()), false);
});

test('offerWindow: delivery window wins; date_end 00:00 Madrid means the day before is the last', () => {
  assert.deepStrictEqual(offerWindow(item({ date_start: '2026-05-13 22:00:00', date_end: '2026-05-21 22:00:00' })),
    { start: '2026-05-14', end: '2026-05-21' });
  // Winter (UTC+1): 23:00Z
  assert.deepStrictEqual(offerWindow(item({ date_start: '2026-11-01 23:00:00', date_end: '2026-11-09 23:00:00' })),
    { start: '2026-11-02', end: '2026-11-09' });
  assert.deepStrictEqual(offerWindow(item({
    date_start: '2026-04-27 22:00:00', date_end: '2026-06-02 22:00:00',
    x_studio_fecha_inicio_entrega: '2026-04-29', x_studio_fecha_final_entrega_1: '2026-06-04',
  })), { start: '2026-04-29', end: '2026-06-04' });
});

test('classifyOffers: in force, upcoming (14 days), ended (7 days), the rest out', () => {
  const offers = classifyOffers([
    item({ id: 1, x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-10-15', x_studio_fecha_final_entrega_1: '2026-10-25' }),
    item({ id: 2, x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-10-25', x_studio_fecha_final_entrega_1: '2026-11-05' }),
    item({ id: 3, x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-10-01', x_studio_fecha_final_entrega_1: '2026-10-15' }),
    item({ id: 4, x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-09-01', x_studio_fecha_final_entrega_1: '2026-09-15' }),
    item({ id: 5, x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-12-01', x_studio_fecha_final_entrega_1: '2026-12-15' }),
    item({ id: 6, x_studio_tipo_de_precio: 'Tarifa', date_end: '2026-10-30 23:00:00' }),
  ], TODAY, { customersByPricelist: { 21: ['AHORRAMAS S.A.'] } });
  assert.deepStrictEqual(offers.map(o => [o.id, o.status]), [[1, 'vigente'], [2, 'proxima'], [3, 'terminada']]);
  assert.strictEqual(offers[0].product, 'PATATAS TODO USO CULINARIO CAJA');
  assert.strictEqual(offers[0].pricelist, 'AHORRAMAS S.A.');
  assert.deepStrictEqual(offers[0].customers, ['AHORRAMAS S.A.']);
  assert.strictEqual(offers[0].unclassified, false);
});

test('classifyOffers: rule with dates but no type is an unclassified offer; bad dates are flagged', () => {
  const [o] = classifyOffers([item({ date_start: '2026-10-14 22:00:00', date_end: '2026-10-22 22:00:00' })], TODAY);
  assert.strictEqual(o.status, 'vigente');
  assert.strictEqual(o.unclassified, true);
  // Real case (AHORRAMAS): delivery from 25/05/2026 to 10/06/2025
  const [bad] = classifyOffers([item({ x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-10-18', x_studio_fecha_final_entrega_1: '2025-10-30' })], TODAY);
  assert.strictEqual(bad.status, 'vigente');
  assert.strictEqual(bad.badDates, true);
  assert.match(bad.issue, /incoherentes/);
});

test('offerForLine: same pricelist or its base (rappel), product template and delivery day in the window', () => {
  const offers = classifyOffers([item({ id: 9, x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-10-15', x_studio_fecha_final_entrega_1: '2026-10-25' })], TODAY);
  const chain = pricelistChain([{ pricelist_id: [22, 'Distribución Logística 2,60%'], base_pricelist_id: [21, 'AHORRAMAS S.A.'] }]);
  const line = { id: 1, product_id: [3001, '[01TU5C] ...'], productTmplId: 7302 };
  assert.strictEqual(offerForLine(offers, chain, 21, line, '2026-10-20')?.id, 9);
  assert.strictEqual(offerForLine(offers, chain, 22, line, '2026-10-20')?.id, 9);
  assert.strictEqual(offerForLine(offers, chain, 22, line, '2026-10-26'), null);
  assert.strictEqual(offerForLine(offers, chain, 8, line, '2026-10-20'), null);
  assert.strictEqual(offerForLine(offers, chain, 21, { ...line, productTmplId: 1 }, '2026-10-20'), null);
});

test('diffOffers: first run silent; new, changed, starts today and ended', () => {
  const now = new Date('2026-10-19T08:00:00Z');
  const base = { id: 1, x_studio_tipo_de_precio: 'Oferta', x_studio_fecha_inicio_entrega: '2026-10-20', x_studio_fecha_final_entrega_1: '2026-10-25' };
  const before = classifyOffers([item(base)], TODAY);
  assert.deepStrictEqual(diffOffers(null, before, now), []);

  const prev = snapshotOf(before);
  const added = classifyOffers([item(base), item({ ...base, id: 2 })], TODAY);
  const evNew = diffOffers(prev, added, now);
  assert.deepStrictEqual(evNew.map(e => e.changes[0].type), ['OFERTA_NUEVA']);
  assert.strictEqual(evNew[0].kind, 'oferta');
  assert.strictEqual(evNew[0].priority, 'normal');
  assert.match(evNew[0].summary, /del 20\/10 al 25\/10/);

  const moved = classifyOffers([item({ ...base, x_studio_fecha_final_entrega_1: '2026-10-28' })], TODAY);
  assert.deepStrictEqual(diffOffers(prev, moved, now).map(e => e.changes[0].type), ['OFERTA_CAMBIADA']);

  const nextDay = classifyOffers([item(base)], '2026-10-20');
  assert.deepStrictEqual(diffOffers(prev, nextDay, now).map(e => e.changes[0].type), ['OFERTA_EMPIEZA']);

  const later = classifyOffers([item(base)], '2026-10-26');
  const ended = diffOffers(snapshotOf(nextDay), later, now);
  assert.deepStrictEqual(ended.map(e => [e.changes[0].type, e.priority]), [['OFERTA_TERMINADA', 'info']]);
  assert.deepStrictEqual(diffOffers(snapshotOf(later), later, now), []);
});
