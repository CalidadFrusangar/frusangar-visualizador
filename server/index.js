const express = require('express');
const path = require('path');
require('dotenv').config();

const store = require('./store');
const poller = require('./poller');
const push = require('./push');
const { fetchOrdersByDay } = require('./fetchOrders');
const { PRIORITY_RANK } = require('./diff');
const auth = require('./auth');
const { fetchEmployees } = require('./employees');
const odooNotes = require('./odooNotes');
const { ODOO_URL } = require('./odoo');
const { tagOrders } = require('./offers');

const app = express();
// Render (and ngrok) sit in front as a proxy: needed for req.secure and the client IP
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});
app.use(express.json({ limit: '20kb' }));

// Same origin only (no CORS). Everything under /api needs the PIN except login/session.
auth.registerRoutes(app);
app.use('/api', auth.requireAuth);

// How long an order keeps its "modified" highlight
const RECENT_MS = 3 * 60 * 60 * 1000;

// Until the poller has data, every screen asks at once: share one Odoo fetch instead of one per request
let firstFetch = null;

app.get('/api/orders', async (req, res) => {
  let data = poller.getLatest();
  if (!data) {
    try {
      firstFetch ||= fetchOrdersByDay().finally(() => { firstFetch = null; });
      data = await firstFetch;
    } catch (err) {
      console.error('Fetch error:', err.message);
      return res.status(500).json({ error: 'No se pudo conectar con Odoo' });
    }
  }

  const since = Date.now() - RECENT_MS;
  const recentByOrder = new Map();
  for (const e of store.state.events) {
    if (new Date(e.ts).getTime() < since) break;
    if (!recentByOrder.has(e.orderId)) recentByOrder.set(e.orderId, []);
    recentByOrder.get(e.orderId).push(e);
  }
  const pending = new Set(poller.pendingOrderIds());
  // Lines served with an offer (pricelist + product + delivery day), without prices
  const offerData = poller.getOffers();
  const offerTags = tagOrders(data.orders, offerData);

  const orders = Object.fromEntries(Object.entries(data.orders).map(([key, list]) => [
    key,
    list.map(o => ({
      ...o,
      lines: (o.lines || []).map(l => (offerTags[l.id] ? { ...l, offer: offerTags[l.id] } : l)),
      recentEvents: recentByOrder.get(o.id) || [],
      changePending: pending.has(o.id),
    })),
  ]));

  res.json({
    days: data.days,
    orders,
    offers: offerData ? { offers: offerData.offers, fetchedAt: offerData.fetchedAt } : null,
    stock: data.stock || null,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    error: poller.getLastError(),
    serverTime: new Date().toISOString(),
  });
});

// Pricelist offers (in force, upcoming, recently ended); null until the first read
app.get('/api/offers', (req, res) => {
  const offerData = poller.getOffers();
  res.json(offerData ? { offers: offerData.offers, fetchedAt: offerData.fetchedAt } : null);
});

app.get('/api/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(store.state.events.slice(0, limit));
});

// Opens the sale order form in Odoo (link from cards and alerts; Odoo asks for its own login)
app.get('/api/odoo/sale-order/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0 || !ODOO_URL) return res.status(400).send('Pedido no válido');
  res.redirect(`${ODOO_URL.replace(/\/+$/, '')}/web#id=${id}&model=sale.order&view_type=form`);
});

app.get('/api/employees', async (req, res) => {
  try {
    res.json(await fetchEmployees());
  } catch (err) {
    console.error('Employees error:', err.message);
    res.status(502).json({ error: 'No se pudo leer la lista de empleados de Odoo' });
  }
});

// Mark an alert as seen by a Navalcarnero employee
app.post('/api/events/:id/ack', async (req, res) => {
  let employees;
  try {
    employees = await fetchEmployees();
  } catch (err) {
    return res.status(502).json({ error: 'No se pudo leer la lista de empleados de Odoo' });
  }
  const employee = employees.find(e => e.id === Number(req.body?.employeeId));
  if (!employee) return res.status(400).json({ error: 'Empleado no válido' });
  const { event, created } = store.ackEvent(req.params.id, employee);
  if (!event) return res.status(404).json({ error: 'Aviso no encontrado' });
  res.json(event);
  if (created) {
    console.log(`Aviso ${event.orderName} visto por ${event.ack.name}`);
    // Replace the pending notification on every phone with "seen by"
    push.sendAck(event).catch(err => console.error('Push ack error:', err.message));
    odooNotes.postAckNote(event)
      .then(posted => posted && console.log(`Nota en Odoo: ${event.orderName} visto por ${event.ack.name}`))
      .catch(err => console.error('Nota en Odoo falló:', err.message));
  }
});

// Archive / restore alerts: { ids: [...], archived: true|false }
app.post('/api/events/archive', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(id => typeof id === 'string').slice(0, 200) : [];
  if (!ids.length) return res.status(400).json({ error: 'Sin avisos' });
  const changed = store.archiveEvents(ids, req.body?.archived !== false);
  res.json(changed);
});

app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: push.publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const { subscription, minPriority = 'normal', label = '' } = req.body || {};
  if (!subscription?.endpoint || !(minPriority in PRIORITY_RANK)) {
    return res.status(400).json({ error: 'Suscripción no válida' });
  }
  store.upsertSubscription({ endpoint: subscription.endpoint, subscription, minPriority, label, createdAt: new Date().toISOString() });
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  if (req.body?.endpoint) store.removeSubscription(req.body.endpoint);
  res.json({ ok: true });
});

// Send a test notification to one subscription
app.post('/api/push/test', async (req, res) => {
  const sub = store.state.subscriptions.find(s => s.endpoint === req.body?.endpoint);
  if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });
  try {
    await require('web-push').sendNotification(sub.subscription, JSON.stringify({
      title: '🔔 Avisos activados',
      body: 'Recibirás aquí los cambios de pedidos de Navalcarnero.',
      tag: 'test', url: '/',
    }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  poller.start();
  console.log(`Server running on port ${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
});
