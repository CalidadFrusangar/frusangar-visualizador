const test = require('node:test');
const assert = require('node:assert');
const { lineKg } = require('./fetchOrders');

const weights = new Map([[1, { weight: 2.5, uomId: 40 }], [2, { weight: 1, uomId: 12 }], [3, { weight: 0, uomId: 1 }]]);

test('kilos: bags × product weight, Kg lines as is, unknown → null', () => {
  assert.strictEqual(lineKg({ product_id: [1, 'PAPA'], product_uom: [40, 'Bolsa'], product_uom_qty: 80 }, weights), 200);
  assert.strictEqual(lineKg({ product_id: [2, 'SACO'], product_uom: [12, 'Kg'], product_uom_qty: 250 }, weights), 250);
  assert.strictEqual(lineKg({ product_id: [3, 'ABONO'], product_uom: [1, 'UNIDAD'], product_uom_qty: 1 }, weights), null);
  assert.strictEqual(lineKg({ product_id: [1, 'PAPA'], product_uom: [1, 'UNIDAD'], product_uom_qty: 5 }, weights), null);
  assert.strictEqual(lineKg({ display_type: 'line_note', product_id: false }, weights), null);
});
