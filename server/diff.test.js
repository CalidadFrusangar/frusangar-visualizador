const test = require('node:test');
const assert = require('node:assert');
const { diffOrder, buildEvent, dayKeyOf } = require('./diff');
const { madridDayRanges, madridMidnightUtc } = require('./dates');

// "now" = 15 Oct 2026, 10:00 Madrid (08:00 UTC)
const NOW = new Date('2026-10-15T08:00:00Z');
const TODAY = '2026-10-15T07:00:00.000Z';
const TOMORROW = '2026-10-16T07:00:00.000Z';
const DAY_AFTER = '2026-10-17T07:00:00.000Z';

const line = (id, productId, qty, bultos = 0) =>
  ({ id, kind: 'product', productId, product: `Prod ${productId}`, qty, bultos, uom: 'kg' });

const snap = (over = {}) => ({
  id: 1, name: 'PVNAV/1', partner: 'Cliente', typeId: 1, deliveryDate: TOMORROW,
  state: 'sale', pickingStatus: 'pendiente', lines: [line(10, 100, 40, 4), line(11, 101, 20)], ...over,
});

const types = (changes) => changes.map(c => c.type).sort();

test('no changes', () => {
  assert.deepStrictEqual(diffOrder(snap(), snap()), []);
});

test('quantity increase and decrease', () => {
  const curr = snap({ lines: [line(10, 100, 60, 6), line(11, 101, 10)] });
  assert.deepStrictEqual(types(diffOrder(snap(), curr)), ['AUMENTO', 'DISMINUCION']);
});

test('line removed and added', () => {
  const curr = snap({ lines: [line(10, 100, 40, 4), line(12, 102, 5)] });
  assert.deepStrictEqual(types(diffOrder(snap(), curr)), ['LINEA_AÑADIDA', 'LINEA_ELIMINADA']);
});

test('line deleted and re-created with same product is a qty change', () => {
  const curr = snap({ lines: [line(10, 100, 40, 4), line(99, 101, 25)] });
  const changes = diffOrder(snap(), curr);
  assert.deepStrictEqual(types(changes), ['AUMENTO']);
  assert.strictEqual(changes[0].after.qty, 25);
});

test('cancellation short-circuits', () => {
  assert.deepStrictEqual(types(diffOrder(snap(), snap({ state: 'cancel' }))), ['CANCELADO']);
});

test('new order', () => {
  assert.deepStrictEqual(types(diffOrder(null, snap())), ['NUEVO_PEDIDO']);
});

test('date change only when Madrid day differs', () => {
  assert.deepStrictEqual(diffOrder(snap(), snap({ deliveryDate: '2026-10-16T09:30:00.000Z' })), []);
  assert.deepStrictEqual(types(diffOrder(snap(), snap({ deliveryDate: DAY_AFTER }))), ['CAMBIO_FECHA']);
});

test('note changes are reported', () => {
  const prev = snap({ lines: [...snap().lines, { id: 20, kind: 'note', text: 'Sin etiqueta' }] });
  const curr = snap({ lines: [...snap().lines, { id: 20, kind: 'note', text: 'Con etiqueta' }] });
  assert.deepStrictEqual(types(diffOrder(prev, curr)), ['NOTA_CAMBIADA']);
});

test('priority: any change on today is critical', () => {
  const prev = snap({ deliveryDate: TODAY });
  const ev = buildEvent(prev, snap({ deliveryDate: TODAY, lines: [line(10, 100, 50, 5), line(11, 101, 20)] }), NOW);
  assert.strictEqual(ev.priority, 'critico');
});

test('priority: change after delivery note validated is critical even for day after', () => {
  const prev = snap({ deliveryDate: DAY_AFTER, pickingStatus: 'validado' });
  const ev = buildEvent(prev, snap({ deliveryDate: DAY_AFTER, pickingStatus: 'parcial', lines: [line(10, 100, 50, 5), line(11, 101, 20)] }), NOW);
  assert.strictEqual(ev.priority, 'critico');
  assert.strictEqual(ev.wasValidated, true);
});

test('priority: tomorrow reduction is high, increase is normal', () => {
  const dec = buildEvent(snap(), snap({ lines: [line(10, 100, 40, 4)] }), NOW);
  assert.strictEqual(dec.priority, 'alto');
  const inc = buildEvent(snap(), snap({ lines: [line(10, 100, 80, 8), line(11, 101, 20)] }), NOW);
  assert.strictEqual(inc.priority, 'normal');
});

test('priority: moving an order into today is critical', () => {
  const ev = buildEvent(snap({ deliveryDate: DAY_AFTER }), snap({ deliveryDate: TODAY }), NOW);
  assert.strictEqual(ev.priority, 'critico');
});

test('priority: delivery note validated alone is info', () => {
  const ev = buildEvent(snap(), snap({ pickingStatus: 'validado' }), NOW);
  assert.strictEqual(ev.priority, 'info');
});

test('grouped edits that cancel out produce no event', () => {
  assert.strictEqual(buildEvent(snap(), snap(), NOW), null);
});

test('summary text', () => {
  const ev = buildEvent(snap(), snap({ lines: [line(10, 100, 60, 6)] }), NOW);
  assert.match(ev.summary, /Prod 100: 4 bultos → 6 bultos \(\+2 bultos\)/);
  assert.match(ev.summary, /− Prod 101 eliminado/);
});

test('summary uses sale unit when bultos did not change', () => {
  const ev = buildEvent(snap(), snap({ lines: [line(10, 100, 45, 4), line(11, 101, 20)] }), NOW);
  assert.match(ev.summary, /Prod 100: 40 kg → 45 kg \(\+5 kg\)/);
});

test('dayKeyOf uses Madrid time (00:00 Madrid = 22:00Z previous day)', () => {
  assert.strictEqual(dayKeyOf('2026-10-14T22:00:00.000Z', NOW), 'today');
  assert.strictEqual(dayKeyOf('2026-10-14T21:59:00.000Z', NOW), 'past');
});

test('Madrid day ranges across DST change (25 Oct 2026)', () => {
  assert.strictEqual(madridMidnightUtc('2026-10-25').toISOString(), '2026-10-24T22:00:00.000Z');
  assert.strictEqual(madridMidnightUtc('2026-10-26').toISOString(), '2026-10-25T23:00:00.000Z');
  assert.strictEqual(madridMidnightUtc('2026-03-29').toISOString(), '2026-03-28T23:00:00.000Z');
  const [today] = madridDayRanges(new Date('2026-10-14T22:30:00Z')); // 00:30 Madrid on the 15th
  assert.strictEqual(today.date, '2026-10-15');
  const [late] = madridDayRanges(new Date('2026-10-15T21:30:00Z')); // 23:30 Madrid on the 15th
  assert.strictEqual(late.date, '2026-10-15');
});
