// JSON-file persistence. Swap this module for a DB-backed one in production (same interface).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_EVENTS = 200;

const empty = () => ({ snapshots: null, windowEnd: null, pending: {}, events: [], subscriptions: [], boxAlerts: {}, offerSnapshots: null });

let state = empty();

function load() {
  try {
    state = { ...empty(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    // Alerts seen before archiving existed count as archived
    for (const e of state.events) if (e.ack && !e.archivedAt) e.archivedAt = e.ack.at;
    console.log(`State loaded: ${Object.keys(state.snapshots || {}).length} snapshots, ` +
      `${state.events.length} events, ${state.subscriptions.length} push subscriptions`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not read state file, starting fresh:', err.message);
    state = empty();
  }
  return state;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

function addEvents(events) {
  state.events = [...events, ...state.events].slice(0, MAX_EVENTS);
}

// Who saw an alert: the first acknowledgement is kept. created = this call set it.
function ackEvent(id, employee, now = new Date()) {
  const event = state.events.find(e => e.id === id);
  if (!event) return { event: null, created: false };
  if (event.ack) return { event, created: false };
  event.ack = { employeeId: employee.id, name: employee.name, at: now.toISOString() };
  // Seen = dealt with: it leaves the alert list (still under «Archivados»)
  if (!event.archivedAt) event.archivedAt = event.ack.at;
  save();
  return { event, created: true };
}

// Archive (or restore) alerts on every device. Returns the events that changed.
function archiveEvents(ids, archived = true, now = new Date()) {
  const wanted = new Set(ids);
  const changed = [];
  for (const event of state.events) {
    if (!wanted.has(event.id) || !!event.archivedAt === archived) continue;
    if (archived) event.archivedAt = now.toISOString();
    else delete event.archivedAt;
    changed.push(event);
  }
  if (changed.length) save();
  return changed;
}

function upsertSubscription(sub) {
  state.subscriptions = state.subscriptions.filter(s => s.endpoint !== sub.endpoint);
  state.subscriptions.push(sub);
  save();
}

function removeSubscription(endpoint) {
  const before = state.subscriptions.length;
  state.subscriptions = state.subscriptions.filter(s => s.endpoint !== endpoint);
  if (state.subscriptions.length !== before) save();
}

module.exports = {
  load, save, addEvents, ackEvent, archiveEvents, upsertSubscription, removeSubscription,
  get state() { return state; },
  DATA_DIR,
};
