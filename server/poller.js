// Polls Odoo, detects order changes against stored snapshots and emits grouped, prioritized events.
const store = require('./store');
const push = require('./push');
const { fetchOrdersByDay, fetchOrderStatus } = require('./fetchOrders');
const { toSnapshot, diffOrder, buildEvent, DAY_LABEL } = require('./diff');
const { boxAlertEvents, pruneAlerted } = require('./boxes');

const POLL_MS = Number(process.env.POLL_MS) || 30_000;
// Salespeople save several times in a row: wait for this much quiet before notifying...
const QUIET_MS = Number(process.env.NOTIFY_QUIET_MS) || 60_000;
// ...but never hold a change longer than this
const MAX_WAIT_MS = 5 * 60_000;
// Returnable boxes must be declared within this time after validating the delivery note
const BOX_ALERT_MS = (Number(process.env.BOX_ALERT_MIN) || 120) * 60_000;

let latest = null;          // last fetch result, served by /api/orders
let lastError = null;
let running = false;

async function pollOnce(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const result = await fetchOrdersByDay(now);
    latest = { ...result, fetchedAt: now.toISOString() };
    lastError = null;
    await detectChanges(result, now);
  } catch (err) {
    lastError = err.message || String(err);
    console.error('Poll error:', lastError);
  } finally {
    running = false;
  }
}

async function detectChanges(result, now) {
  const { state } = store;
  const current = {};
  for (const list of Object.values(result.orders)) {
    for (const o of list) current[o.id] = toSnapshot(o);
  }

  // First run: just record the baseline, no notifications (old undeclared boxes included)
  if (!state.snapshots) {
    boxAlertEvents(result.orders, state.boxAlerts, now, BOX_ALERT_MS);
    state.snapshots = current;
    state.windowEnd = result.windowEnd;
    store.save();
    console.log(`Baseline recorded: ${Object.keys(current).length} orders`);
    return;
  }

  const prevSnaps = state.snapshots;
  const prevWindowEnd = state.windowEnd;

  // Orders that left the window although their previous date is still in it: find out why
  const goneIds = Object.values(prevSnaps)
    .filter(s => !current[s.id] && s.deliveryDate >= result.windowStart)
    .map(s => s.id);
  const ghosts = {};
  for (const st of await fetchOrderStatus(goneIds)) {
    const prev = prevSnaps[st.id];
    ghosts[st.id] = {
      ...prev,
      state: ['sale', 'done'].includes(st.state) ? prev.state : st.state,
      deliveryDate: st.deliveryDate || prev.deliveryDate,
    };
  }

  const all = { ...current, ...ghosts };
  for (const [id, curr] of Object.entries(all)) {
    const prev = prevSnaps[id] || null;
    // Orders that only appear because the window moved forward at midnight are not "new"
    if (!prev && prevWindowEnd && curr.deliveryDate >= prevWindowEnd) continue;
    // Already-cancelled orders seen for the first time are not interesting
    if (!prev && curr.state === 'cancel') continue;
    if (prev && diffOrder(prev, curr).length === 0) continue;

    const group = state.pending[id];
    if (group) {
      group.latest = curr;
      group.lastAt = now.toISOString();
    } else {
      state.pending[id] = { baseline: prev, latest: curr, firstAt: now.toISOString(), lastAt: now.toISOString() };
    }
  }

  state.snapshots = current;
  state.windowEnd = result.windowEnd;

  const events = flushPending(now);
  pruneAlerted(state.boxAlerts, now);
  const dayTitles = { ...DAY_LABEL, ...Object.fromEntries(result.days.map(d => [d.key, d.title])) };
  events.push(...boxAlertEvents(result.orders, state.boxAlerts, now, BOX_ALERT_MS, dayTitles));
  if (events.length) {
    store.addEvents(events);
    for (const e of events) console.log(`[${e.priority.toUpperCase()}] ${e.orderName} (${e.dayLabel}): ${e.summary}`);
  }
  store.save();

  if (events.length) await push.sendEvents(events);
}

function flushPending(now) {
  const { state } = store;
  const events = [];
  for (const [id, group] of Object.entries(state.pending)) {
    const quiet = now - new Date(group.lastAt) >= QUIET_MS;
    const tooOld = now - new Date(group.firstAt) >= MAX_WAIT_MS;
    if (!quiet && !tooOld) continue;
    delete state.pending[id];
    const event = buildEvent(group.baseline, group.latest, now);
    if (event) events.push(event);
  }
  return events;
}

function start() {
  store.load();
  pollOnce();
  setInterval(() => pollOnce(), POLL_MS);
  console.log(`Poller started (every ${POLL_MS / 1000}s, notify after ${QUIET_MS / 1000}s quiet)`);
}

module.exports = {
  start, pollOnce,
  getLatest: () => latest,
  getLastError: () => lastError,
  pendingOrderIds: () => Object.keys(store.state.pending).map(Number),
};
