import { test } from 'node:test';
import assert from 'node:assert';
import { filterOrders, matchOrder } from './search.js';

const line = (id, name, packaging) => ({ id, product_id: [id, name], product_packaging_id: packaging ? [1, packaging] : false });
const orders = [
  { id: 1, name: 'PVNAV/14619', partner_id: [1707, 'NOVARANDIS, S.L.'], lines: [
    line(11, '[01RE1C] PAPA REINA GUARNICIÓN CAJA (20 BOLSAS X 1 KG)'),
    line(12, '[01PU25C] PATATAS DEL PUEBLO CAJA (8 BOLSAS X 2.5 KG)', 'CAJA 8 X 2,5'),
    { id: 13, display_type: 'line_note', name: 'Nota reina' },
  ] },
  { id: 2, name: 'PVNAV/14603', partner_id: [9, 'UNIDE SDA.COOP.'], lines: [line(21, '[01RE5C] PATATAS PAPA REINA LAVADA CAJA (4 BOLSAS X 5 KG)')] },
];

test('búsqueda vacía devuelve todo', () => {
  assert.strictEqual(filterOrders(orders, '  '), orders);
});

test('por cliente, sin mayúsculas, sin marcar líneas', () => {
  const r = filterOrders(orders, 'novarandis');
  assert.deepStrictEqual(r.map(o => o.id), [1]);
  assert.strictEqual(r[0].searchLineIds, undefined);
});

test('por número de pedido', () => {
  assert.deepStrictEqual(filterOrders(orders, '14603').map(o => o.id), [2]);
});

test('por producto marca las líneas que casan, sin acentos', () => {
  const r = filterOrders(orders, 'guarnicion');
  assert.deepStrictEqual(r.map(o => o.id), [1]);
  assert.deepStrictEqual([...r[0].searchLineIds], [11]);
});

test('varias palabras en la misma línea', () => {
  assert.deepStrictEqual(filterOrders(orders, 'reina 5 kg').map(o => o.id), [2]);
  assert.deepStrictEqual(filterOrders(orders, 'reina').map(o => o.id), [1, 2]);
});

test('cliente + producto combinados', () => {
  const r = filterOrders(orders, 'novarandis pueblo');
  assert.deepStrictEqual(r.map(o => o.id), [1]);
  assert.deepStrictEqual([...r[0].searchLineIds], [12]);
  assert.strictEqual(matchOrder(orders[1], 'unide pueblo'), null);
});

test('por referencia y por empaquetado', () => {
  assert.deepStrictEqual(filterOrders(orders, '01re5c').map(o => o.id), [2]);
  assert.deepStrictEqual(filterOrders(orders, '8 x 2,5').map(o => o.id), [1]);
});
