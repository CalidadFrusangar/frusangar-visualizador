// Posts ONE test internal note ("🧪 PRUEBA") on a sale order and prints how Odoo stored it.
// Usage: node test_ack_note.js PVNAV/13701
require('dotenv').config({ quiet: true });
const { executeKw } = require('./odoo');
const { postAckNote } = require('./odooNotes');

(async () => {
  const name = process.argv[2];
  if (!name) throw new Error('Indica el pedido, p. ej.: node test_ack_note.js PVNAV/13701');
  const [order] = await executeKw('sale.order', 'search_read', [[['name', '=', name]]], { fields: ['id', 'name'], limit: 1 });
  if (!order) throw new Error(`No existe el pedido ${name}`);

  await postAckNote({
    orderId: order.id,
    priority: 'critico',
    ack: { name: 'Prueba del visualizador', at: new Date().toISOString() },
    changes: [{ priority: 'critico', text: 'EJEMPLO DE PRODUCTO: 40 bultos → 60 bultos' }],
  }, { force: true, prefix: '🧪 PRUEBA, no es un aviso real' });

  const [msg] = await executeKw('mail.message', 'search_read',
    [[['model', '=', 'sale.order'], ['res_id', '=', order.id]]],
    { fields: ['body', 'author_id', 'subtype_id', 'message_type', 'partner_ids'], limit: 1, order: 'id desc' });
  console.log(`Nota de prueba en ${order.name}:`);
  console.log(JSON.stringify(msg, null, 1));
})().catch(err => { console.error('Error:', err.message); process.exit(1); });
