const test = require('node:test');
const assert = require('node:assert');
const { ackNoteBody, toHtml, ENABLED } = require('./odooNotes');

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

test('note HTML: escaped, one line per item', () => {
  assert.strictEqual(toHtml('Visto por <Ana> & Co.\n· A: 1 → 2'), '<p>Visto por &lt;Ana&gt; &amp; Co.<br>· A: 1 → 2</p>');
});
