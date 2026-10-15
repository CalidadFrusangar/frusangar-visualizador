const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'visualizador-'));
const store = require('./store');

test('ackEvent keeps the first employee who saw the alert', () => {
  store.load();
  store.addEvents([{ id: 'e1', orderName: 'PVNAV/1' }]);
  const first = store.ackEvent('e1', { id: 5, name: 'Ana' }, new Date('2026-10-15T10:00:00Z'));
  assert.strictEqual(first.created, true);
  assert.deepStrictEqual(first.event.ack, { employeeId: 5, name: 'Ana', at: '2026-10-15T10:00:00.000Z' });
  const second = store.ackEvent('e1', { id: 6, name: 'Luis' });
  assert.strictEqual(second.created, false);
  assert.strictEqual(second.event.ack.name, 'Ana');
  assert.strictEqual(store.ackEvent('nope', { id: 5, name: 'Ana' }).event, null);
  // persisted
  store.load();
  assert.strictEqual(store.state.events[0].ack.name, 'Ana');
});
