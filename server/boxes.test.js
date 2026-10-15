const test = require('node:test');
const assert = require('node:assert');
const { boxStatus } = require('./boxes');

const pick = (id, state, declared = false, text = false) =>
  ({ id, picking_type_code: 'outgoing', state, x_cajas_declaradas: declared, x_cajas_declaracion: text });

test('no returnable boxes: nothing to declare', () => {
  assert.strictEqual(boxStatus([pick(1, 'done')], { 1: [] }), null);
});

test('not validated yet: nothing to declare', () => {
  assert.strictEqual(boxStatus([pick(1, 'assigned')], {}), null);
});

test('boxes shipped: sin_declarar until marked, then declarada with its detail', () => {
  assert.strictEqual(boxStatus([pick(1, 'done')], { 1: ['Euro Pool 156'] }).status, 'sin_declarar');
  const r = boxStatus([pick(1, 'done', true, 'Euro Pool mov. 1 · hoy · X')], { 1: ['Euro Pool 156'] });
  assert.strictEqual(r.status, 'declarada');
  assert.deepStrictEqual(r.boxes, ['Euro Pool 156']);
  assert.deepStrictEqual(r.detail, ['Euro Pool mov. 1 · hoy · X']);
});

test('only delivery notes with boxes count', () => {
  const r = boxStatus([pick(1, 'done', true), pick(2, 'done')], { 1: ['IFCO LL6424'], 2: [] });
  assert.strictEqual(r.status, 'declarada');
  assert.strictEqual(boxStatus([pick(1, 'done', true), pick(2, 'done')], { 1: ['IFCO LL6424'], 2: ['IFCO LL6424'] }).status, 'sin_declarar');
});

test('a declared mark counts even if the boxes were not detected', () => {
  assert.strictEqual(boxStatus([pick(1, 'done', true)], { 1: [] }).status, 'declarada');
});

const { boxAlertEvents } = require('./boxes');

test('boxStatus lists undeclared delivery notes with validation time', () => {
  const p = { ...pick(7, 'done'), name: 'FRU/FRUSAL//1', date_done: '2026-10-15 08:00:00' };
  const r = boxStatus([p], { 7: ['Euro Pool 156'] });
  assert.deepStrictEqual(r.undeclared, [{ id: 7, name: 'FRU/FRUSAL//1', boxes: ['Euro Pool 156'], doneAt: '2026-10-15T08:00:00.000Z' }]);
});

test('boxAlertEvents: alerts once, only after the delay, never for cancelled orders', () => {
  const undeclared = [{ id: 7, name: 'FRU/FRUSAL//1', boxes: ['Euro Pool 156'], doneAt: '2026-10-15T08:00:00.000Z' }];
  const order = { id: 1, name: 'PVNAV/1', partner_id: [1, 'AHORRAMAS'], type_id: [1, 'Nav'], state: 'sale', boxes: { status: 'sin_declarar', undeclared } };
  const alerted = {};
  const H = 3600_000;
  assert.strictEqual(boxAlertEvents({ today: [order] }, alerted, new Date('2026-10-15T09:59:00Z'), 2 * H).length, 0);
  const events = boxAlertEvents({ today: [order] }, alerted, new Date('2026-10-15T10:01:00Z'), 2 * H, { today: 'Hoy' });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].priority, 'alto');
  assert.strictEqual(events[0].dayLabel, 'Hoy');
  assert.match(events[0].summary, /Euro Pool 156 sin declarar · albarán FRU\/FRUSAL\/\/1 validado a las 10:00/);
  assert.strictEqual(boxAlertEvents({ today: [order] }, alerted, new Date('2026-10-15T11:00:00Z'), 2 * H).length, 0);
  assert.strictEqual(boxAlertEvents({ today: [{ ...order, state: 'cancel' }] }, {}, new Date('2026-10-15T11:00:00Z'), 2 * H).length, 0);
});
