const test = require('node:test');
const assert = require('node:assert');

process.env.APP_PIN = 'pin-de-prueba';
delete process.env.SESSION_SECRET;
const { createToken, verifyToken, pinMatches, lockedFor, recordFailure } = require('./auth');

const DAY = 24 * 60 * 60 * 1000;

test('pinMatches only accepts the configured PIN', () => {
  assert.strictEqual(pinMatches('pin-de-prueba'), true);
  assert.strictEqual(pinMatches('otro'), false);
  assert.strictEqual(pinMatches(undefined), false);
  assert.strictEqual(pinMatches({}), false);
});

test('session token: valid, tampered, expired', () => {
  const now = Date.now();
  const token = createToken(now);
  assert.strictEqual(verifyToken(token, now + DAY), now);
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ iat: now + 1 })).toString('base64url');
  assert.strictEqual(verifyToken(`${forged}.${sig}`, now), null);
  // Change the first character for sure (it failed 1 in 64 runs when the signature already began with «x»)
  assert.strictEqual(verifyToken(`${payload}.${sig[0] === 'x' ? 'y' : 'x'}${sig.slice(1)}`, now), null);
  assert.strictEqual(verifyToken(token, now + 181 * DAY), null);
  assert.strictEqual(verifyToken('basura', now), null);
  assert.strictEqual(verifyToken(null, now), null);
});

test('5 failed attempts lock that IP for 15 minutes, not others', () => {
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordFailure('1.2.3.4', now);
  assert.strictEqual(lockedFor('1.2.3.4', now), 15);
  assert.strictEqual(lockedFor('5.6.7.8', now), 0);
  assert.strictEqual(lockedFor('1.2.3.4', now + 15 * 60 * 1000 + 1), 0);
});
