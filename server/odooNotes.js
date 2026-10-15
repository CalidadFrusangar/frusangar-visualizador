const { executeKw } = require('./odoo');

// The only write the visualizer makes in Odoo: an internal note (never e-mailed to the customer)
// on the sale order when an alert is marked as seen. Off unless ODOO_ACK_NOTES=true.
const ENABLED = process.env.ODOO_ACK_NOTES === 'true';

const PRIORITY_LABEL = { critico: 'crítico', alto: 'importante', normal: 'normal', info: 'info' };
// mail.mt_note («Nota», internal) in Frusangar's Odoo; the API user cannot read ir.model.data to resolve it
const NOTE_SUBTYPE_ID = Number(process.env.ODOO_NOTE_SUBTYPE_ID) || 2;

const madrid = (iso, options) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', ...options });

// Plain text, one item per line (turned into HTML by toHtml)
function ackNoteBody(event) {
  const when = `${madrid(event.ack.at, { day: '2-digit', month: '2-digit', year: 'numeric' })} a las ${madrid(event.ack.at, { hour: '2-digit', minute: '2-digit' })}`;
  const changes = (event.changes || []).filter(c => c.priority !== 'info').map(c => c.text).slice(0, 5);
  return [
    `✔ Aviso ${PRIORITY_LABEL[event.priority] || event.priority} visto en planta por ${event.ack.name} el ${when} (visualizador de pedidos).`,
    ...changes.map(t => `· ${t}`),
  ].join('\n');
}

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toHtml = (text) => `<p>${text.split('\n').map(escapeHtml).join('<br>')}</p>`;

// Odoo 16 keeps the HTML body as is. Note: reading it back with the `xmlrpc` package can show
// "&lt;p&gt;" (it mis-decodes some emoji); the raw XML matches notes written by hand.
// Author = the API user. prefix: e.g. '🧪 PRUEBA' for a manual test note
async function postAckNote(event, { force = false, prefix = '' } = {}) {
  if ((!ENABLED && !force) || event.test || !event.orderId || !event.ack) return false;
  const text = (prefix ? `${prefix}\n` : '') + ackNoteBody(event);
  await executeKw('sale.order', 'message_post', [[event.orderId]], {
    body: toHtml(text),
    message_type: 'comment',
    subtype_id: NOTE_SUBTYPE_ID,
  });
  return true;
}

module.exports = { postAckNote, ackNoteBody, toHtml, ENABLED };
