const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-store-'));
const store = require('./store');

test('seen alerts are archived; archive and restore on every device', () => {
  store.state.events = [{ id: 'a', priority: 'critico' }, { id: 'b', priority: 'info' }, { id: 'c', priority: 'normal' }];

  const { event } = store.ackEvent('a', { id: 7, name: 'Ana' }, new Date('2026-10-15T10:00:00Z'));
  assert.strictEqual(event.archivedAt, '2026-10-15T10:00:00.000Z');

  const changed = store.archiveEvents(['a', 'b', 'zzz'], true, new Date('2026-10-15T11:00:00Z'));
  assert.deepStrictEqual(changed.map(e => e.id), ['b']);
  assert.strictEqual(store.state.events[2].archivedAt, undefined);

  assert.deepStrictEqual(store.archiveEvents(['a'], false).map(e => e.id), ['a']);
  assert.strictEqual(store.state.events[0].archivedAt, undefined);
  assert.strictEqual(store.state.events[0].ack.name, 'Ana');
});
