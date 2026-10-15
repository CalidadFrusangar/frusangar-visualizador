// Read-only: lists today/tomorrow/dayAfter orders (Madrid time) with delivery-note status
const { fetchOrdersByDay } = require('./fetchOrders');

(async () => {
  const result = await fetchOrdersByDay();
  for (const day of result.days) {
    const orders = result.orders[day.key];
    console.log(`\n=== ${day.key} ${day.date} (${orders.length}) ===`);
    for (const o of orders) {
      const pickings = o.pickings.map(p => `${p.name}:${p.state}`).join(', ') || 'sin albarán';
      console.log(`${o.name.padEnd(16)} ${o.state.padEnd(7)} ${(o.partner_id[1] || '').slice(0, 30).padEnd(30)} ` +
        `${o.deliveryDate}  [${o.pickingStatus}] ${pickings}  líneas=${o.lines.length}`);
    }
  }
})().catch(err => { console.error(err); process.exit(1); });
