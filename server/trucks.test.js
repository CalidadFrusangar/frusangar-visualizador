const test = require('node:test');
const assert = require('node:assert');
const { toTruck } = require('./trucks');

test('llegada = carga + 2 días y nombres de Odoo', () => {
  const t = toTruck({
    id: 7, name: 'P17302', partner_id: [1, 'SARL TETTART'], x_studio_variedad: 'SOPRANO', x_variedad_id: false,
    x_deca_transportista_id: [2, 'VITOTRANS, S.L.'], x_studio_fecha_de_carga: '2026-11-30', receipt_status: 'pending',
  });
  assert.deepStrictEqual(t, {
    id: 7, name: 'P17302', variety: 'SOPRANO', supplier: 'SARL TETTART', carrier: 'VITOTRANS, S.L.',
    loadDate: '2026-11-30', arrivalDate: '2026-12-02', partial: false,
  });
});

test('sin fecha de carga no hay llegada', () => {
  const t = toTruck({ id: 1, name: 'P1', partner_id: false, x_studio_variedad: false, x_variedad_id: [3, 'AGRIA'],
    x_deca_transportista_id: false, x_studio_fecha_de_carga: false, receipt_status: 'partial' });
  assert.strictEqual(t.arrivalDate, null);
  assert.strictEqual(t.variety, 'AGRIA');
  assert.strictEqual(t.partial, true);
});
