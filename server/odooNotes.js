const { executeKw } = require('./odoo');

// The only write the visualizer makes in Odoo: an internal note (never e-mailed to the customer)
// on the sale order when an alert is marked as seen. Off unless ODOO_ACK_NOTES=true.
const ENABLED = process.env.ODOO_ACK_NOTES === 'true';

const PRIORITY_LABEL = { critico: 'crítico', alto: 'importante', normal: 'normal', info: 'info' };

const madrid = (iso, options) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', ...options });

// Plain text (one item per line), flattened by toNoteText before posting
function ackNoteBody(event) {
  const when = `${madrid(event.ack.at, { day: '2-digit', month: '2-digit', year: 'numeric' })} a las ${madrid(event.ack.at, { hour: '2-digit', minute: '2-digit' })}`;
  const changes = (event.changes || []).filter(c => c.priority !== 'info').map(c => c.text).slice(0, 5);
  return [
    `✔ Aviso ${PRIORITY_LABEL[event.priority] || event.priority} visto en planta por ${event.ack.name} el ${when} (visualizador de pedidos).`,
    ...changes.map(t => `· ${t}`),
  ].join('\n');
}

// Over XML-RPC Odoo 16 escapes the body as plain text: HTML tags would show literally and
// line breaks collapse, so the note goes on a single line ("… · change · change")
const toNoteText = (text) => text.split('\n').join(' ');

// prefix: e.g. '🧪 PRUEBA' for a manual test note
async function postAckNote(event, { force = false, prefix = '' } = {}) {
  if ((!ENABLED && !force) || event.test || !event.orderId || !event.ack) return false;
  const text = (prefix ? `${prefix} · ` : '') + ackNoteBody(event);
  await executeKw('sale.order', 'message_post', [[event.orderId]], {
    body: toNoteText(text),
    message_type: 'comment',
    subtype_xmlid: 'mail.mt_note',
  });
  return true;
}

module.exports = { postAckNote, ackNoteBody, toNoteText, ENABLED };
