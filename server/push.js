const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const store = require('./store');
const { PRIORITY_RANK } = require('./diff');

const PRIORITY_ICON = { critico: '🔴', alto: '🟠', normal: '🔵', info: '🟢' };
const PRIORITY_LABEL = { critico: 'CRÍTICO', alto: 'IMPORTANTE', normal: 'Cambio', info: 'Info' };

// VAPID keys from env; otherwise generated once and kept in the data dir
function loadVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = path.join(store.DATA_DIR, 'vapid.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    const keys = webpush.generateVAPIDKeys();
    fs.mkdirSync(store.DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(keys, null, 2));
    console.log(`Generated VAPID keys in ${file}. For production set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.`);
    return keys;
  }
}

const vapid = loadVapidKeys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:calidad@frusangar.com', vapid.publicKey, vapid.privateKey);

function payloadFor(event) {
  return JSON.stringify({
    title: `${PRIORITY_ICON[event.priority]} ${PRIORITY_LABEL[event.priority]} · ${event.orderName} · ${event.dayLabel}`,
    body: `${event.partner}\n${event.changes.map(c => c.text).join('\n')}`,
    tag: `order-${event.orderId}`,
    priority: event.priority,
    url: `/?order=${event.orderId}`,
  });
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

// Same tag as the original notification, so it replaces it silently on each phone
function ackPayloadFor(event) {
  return JSON.stringify({
    type: 'ack',
    title: `✔ Visto · ${event.orderName} · ${event.dayLabel}`,
    body: `${event.partner}
Visto por ${event.ack.name} a las ${hhmm(event.ack.at)}`,
    tag: `order-${event.orderId}`,
    priority: event.priority,
    url: `/?order=${event.orderId}`,
  });
}

async function send(subs, payload, urgency) {
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription, payload, { TTL: 3600, urgency });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) store.removeSubscription(s.endpoint);
      else console.error('Push error:', err.statusCode, err.body || err.message);
    }
  }));
}

const subscribersFor = (event) => store.state.subscriptions
  .filter(s => PRIORITY_RANK[event.priority] >= PRIORITY_RANK[s.minPriority || 'normal']);

async function sendAck(event) {
  if (event.priority === 'info') return;
  await send(subscribersFor(event), ackPayloadFor(event), 'normal');
}

async function sendEvents(events) {
  const subs = store.state.subscriptions;
  if (!subs.length) return;
  for (const event of events) {
    if (event.priority === 'info') continue;
    await send(subscribersFor(event), payloadFor(event), event.priority === 'critico' ? 'high' : 'normal');
  }
}

module.exports = { publicKey: vapid.publicKey, sendEvents, sendAck, payloadFor, ackPayloadFor };
