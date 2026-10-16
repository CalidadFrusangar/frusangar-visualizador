const xmlrpc = require('xmlrpc');
require('dotenv').config();

const ODOO_CONFIG = {
  url: process.env.ODOO_URL,
  db: process.env.ODOO_DB,
  username: process.env.ODOO_USER,
  password: process.env.ODOO_PASSWORD,
};

const urlParts = new URL(ODOO_CONFIG.url);
const secure = urlParts.protocol === 'https:';
const host = urlParts.hostname;
const port = urlParts.port || (secure ? 443 : 80);

const createClient = (path) => secure
  ? xmlrpc.createSecureClient({ host, port, path })
  : xmlrpc.createClient({ host, port, path });

const commonClient = createClient('/xmlrpc/2/common');
const objectClient = createClient('/xmlrpc/2/object');

let uid = 0;

// The xmlrpc library has no timeout: a stuck request would block the poller forever
const CALL_TIMEOUT_MS = Number(process.env.ODOO_TIMEOUT_MS) || 45_000;

function call(client, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Odoo no respondió en ${CALL_TIMEOUT_MS / 1000}s (${method})`)), CALL_TIMEOUT_MS);
    client.methodCall(method, params, (err, value) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value);
    });
  });
}

async function authenticate() {
  const value = await call(commonClient, 'authenticate',
    [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}]);
  if (!value) throw new Error('Odoo authentication failed (check credentials)');
  uid = value;
  console.log(`Authenticated with Odoo. UID: ${uid}`);
  return uid;
}

// execute_kw with lazy auth and one retry after re-authenticating
async function executeKw(model, method, args, kwargs = {}) {
  if (!uid) await authenticate();
  const params = () => [ODOO_CONFIG.db, uid, ODOO_CONFIG.password, model, method, args, kwargs];
  try {
    return await call(objectClient, 'execute_kw', params());
  } catch (err) {
    console.warn(`Odoo call ${model}.${method} failed, re-authenticating...`, err.message);
    await authenticate();
    return call(objectClient, 'execute_kw', params());
  }
}

module.exports = { authenticate, executeKw, ODOO_URL: ODOO_CONFIG.url };
