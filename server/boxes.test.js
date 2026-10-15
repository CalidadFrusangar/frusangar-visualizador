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
