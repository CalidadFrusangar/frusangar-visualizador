const crypto = require('crypto');

// Shared PIN access. The PIN lives in APP_PIN (env); each device logs in once and keeps a signed,
// httpOnly session cookie. Changing APP_PIN (or SESSION_SECRET) logs every device out.

const COOKIE = 'fv_session';
const SESSION_DAYS = 180;
const REFRESH_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Brute force: per IP and global failed attempts within a window
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 30;

const PIN = process.env.APP_PIN || '';
const SECRET = process.env.SESSION_SECRET
  || (PIN ? crypto.scryptSync(PIN, 'frusangar-visualizador-session', 32).toString('hex') : '');

if (!PIN) console.error('⚠ Falta APP_PIN en el entorno: la API queda bloqueada hasta configurarlo.');
else if (PIN.length < 6) console.warn('⚠ APP_PIN es corto: usa al menos 6 caracteres.');

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function createToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ iat: now })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

// Returns the issue time of a valid, unexpired token, or null
function verifyToken(token, now = Date.now()) {
  if (!SECRET || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { iat } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof iat !== 'number' || iat > now || now - iat > SESSION_DAYS * DAY_MS) return null;
    return iat;
  } catch {
    return null;
  }
}

function pinMatches(candidate) {
  if (!PIN || typeof candidate !== 'string') return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(PIN).digest();
  return crypto.timingSafeEqual(a, b);
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSessionCookie(req, res) {
  res.cookie(COOKIE, createToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * DAY_MS,
    path: '/',
  });
}

const failures = new Map(); // ip -> [timestamps]
let globalFailures = [];

const recent = (list, now) => list.filter(t => now - t < WINDOW_MS);

function lockedFor(ip, now = Date.now()) {
  const mine = recent(failures.get(ip) || [], now);
  globalFailures = recent(globalFailures, now);
  const blocking = mine.length >= MAX_FAILS_PER_IP ? mine : globalFailures.length >= MAX_FAILS_GLOBAL ? globalFailures : null;
  return blocking ? Math.ceil((blocking[0] + WINDOW_MS - now) / 60000) : 0;
}

function recordFailure(ip, now = Date.now()) {
  failures.set(ip, [...recent(failures.get(ip) || [], now), now]);
  globalFailures.push(now);
}

function isAuthenticated(req) {
  return verifyToken(readCookie(req, COOKIE)) !== null;
}

// Protects every /api route except the login ones; refreshes old sessions
function requireAuth(req, res, next) {
  if (!PIN) return res.status(503).json({ error: 'Acceso no configurado (falta APP_PIN en el servidor)' });
  const iat = verifyToken(readCookie(req, COOKIE));
  if (iat === null) return res.status(401).json({ error: 'Hay que introducir el PIN' });
  if (Date.now() - iat > REFRESH_AFTER_DAYS * DAY_MS) setSessionCookie(req, res);
  next();
}

function registerRoutes(app) {
  app.get('/api/session', (req, res) => {
    res.json({ authenticated: !!PIN && isAuthenticated(req), configured: !!PIN });
  });

  app.post('/api/login', (req, res) => {
    if (!PIN) return res.status(503).json({ error: 'Acceso no configurado (falta APP_PIN en el servidor)' });
    const ip = req.ip;
    const wait = lockedFor(ip);
    if (wait) return res.status(429).json({ error: `Demasiados intentos. Espera ${wait} min.` });
    if (!pinMatches(req.body?.pin)) {
      recordFailure(ip);
      console.warn(`PIN incorrecto desde ${ip}`);
      return res.status(401).json({ error: 'PIN incorrecto' });
    }
    failures.delete(ip);
    setSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });
}

module.exports = { registerRoutes, requireAuth, createToken, verifyToken, pinMatches, lockedFor, recordFailure };
