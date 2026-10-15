const test = require('node:test');
const assert = require('node:assert');
const { ackNoteBody, toNoteText, ENABLED } = require('./odooNotes');

test('notes are off unless ODOO_ACK_NOTES=true', () => {
  assert.strictEqual(ENABLED, process.env.ODOO_ACK_NOTES === 'true');
});

test('ack note: who, when (Madrid time) and what changed', () => {
  const body = ackNoteBody({
    priority: 'critico',
    ack: { name: 'Ana López', at: '2026-10-15T10:40:00Z' },
    changes: [{ priority: 'critico', text: 'PATATA: 40 bultos → 60 bultos' }, { priority: 'info', text: 'Albarán validado' }],
  });
  assert.strictEqual(body, '✔ Aviso crítico visto en planta por Ana López el 15/10/2026 a las 12:40 (visualizador de pedidos).\n· PATATA: 40 bultos → 60 bultos');
});

test('note text: single line, items joined with ·', () => {
  assert.strictEqual(toNoteText('Visto por Ana.\n· A: 1 → 2\n· B: 3 → 4'), 'Visto por Ana. · A: 1 → 2 · B: 3 → 4');
});
