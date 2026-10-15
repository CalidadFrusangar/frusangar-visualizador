const express = require('express');
const path = require('path');
require('dotenv').config();

const store = require('./store');
const poller = require('./poller');
const push = require('./push');
const { fetchOrdersByDay } = require('./fetchOrders');
const { PRIORITY_RANK } = require('./diff');
const auth = require('./auth');

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

app.get('/api/orders', async (req, res) => {
  let data = poller.getLatest();
  if (!data) {
    try {
      data = await fetchOrdersByDay();
    } catch (err) {
      console.error('Fetch error:', err);
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

  const orders = Object.fromEntries(Object.entries(data.orders).map(([key, list]) => [
    key,
    list.map(o => ({
      ...o,
      recentEvents: recentByOrder.get(o.id) || [],
      changePending: pending.has(o.id),
    })),
  ]));

  res.json({
    days: data.days,
    orders,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    error: poller.getLastError(),
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(store.state.events.slice(0, limit));
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
