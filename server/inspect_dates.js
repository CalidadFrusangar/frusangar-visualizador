const xmlrpc = require('xmlrpc');
require('dotenv').config();

const ODOO_CONFIG = {
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB,
    username: process.env.ODOO_USER,
    password: process.env.ODOO_PASSWORD,
};

const urlParts = new URL(ODOO_CONFIG.url);
const port = urlParts.port || (urlParts.protocol === 'https:' ? 443 : 80);

const objectClient = urlParts.protocol === 'https:'
    ? xmlrpc.createSecureClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/object' })
    : xmlrpc.createClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/object' });

const commonClient = urlParts.protocol === 'https:'
    ? xmlrpc.createSecureClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/common' })
    : xmlrpc.createClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/common' });

function authenticate() {
    return new Promise((resolve, reject) => {
        commonClient.methodCall('authenticate', [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}], (err, uid) => {
            if (err) reject(err);
            else resolve(uid);
        });
    });
}

async function inspect() {
    try {
        const uid = await authenticate();
        console.log('Authenticated:', uid);

        // Fetch the specific order from previous inspection or just generic search
        // We saw ID 84259 had commitment_date: false
        const orderId = 84259;

        // Read all date related fields
        objectClient.methodCall('execute_kw', [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.password,
            'sale.order', 'read',
            [[orderId], ['name', 'date_order', 'validity_date', 'commitment_date', 'expected_date', 'effective_date', 'state']]
        ], (err, result) => {
            if (err) console.error(err);
            else console.log('Order Details:', result);
        });

        // Also, let's search for ANY order with type 5 and see what their dates are
        objectClient.methodCall('execute_kw', [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.password,
            'sale.order', 'search_read',
            [[['type_id', '=', 5]]],
            { fields: ['name', 'date_order', 'commitment_date', 'expected_date'], limit: 10 }
        ], (err, result) => {
            if (err) console.error(err);
            else console.log('Sample Internal Orders Dates:', result);
        });

        // Search for orders from Feb 3rd 2026 onwards
        objectClient.methodCall('execute_kw', [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.password,
            'sale.order', 'search_read',
            [[['type_id', '=', 5], ['expected_date', '>=', '2026-02-03 00:00:00']]],
            { fields: ['name', 'date_order', 'expected_date'], limit: 10 }
        ], (err, result) => {
            if (err) console.error(err);
            else console.log('Future Orders:', result);
        });

    } catch (e) {
        console.error(e);
    }
}

inspect();
