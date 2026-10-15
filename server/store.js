// JSON-file persistence. Swap this module for a DB-backed one in production (same interface).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_EVENTS = 200;

const empty = () => ({ snapshots: null, windowEnd: null, pending: {}, events: [], subscriptions: [] });

let state = empty();

function load() {
  try {
    state = { ...empty(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
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
  load, save, addEvents, upsertSubscription, removeSubscription,
  get state() { return state; },
  DATA_DIR,
};
