const xmlrpc = require('xmlrpc');
require('dotenv').config();

const ODOO_CONFIG = {
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB, // 'frusangar-visualizador' based on user info, but using env is safer
    username: process.env.ODOO_USER,
    password: process.env.ODOO_PASSWORD,
};

console.log('Connecting to:', ODOO_CONFIG.url);

const urlParts = new URL(ODOO_CONFIG.url);
const secure = urlParts.protocol === 'https:';
const host = urlParts.hostname;
const port = urlParts.port || (secure ? 443 : 80);

const commonClient = secure
    ? xmlrpc.createSecureClient({ host, port, path: '/xmlrpc/2/common' })
    : xmlrpc.createClient({ host, port, path: '/xmlrpc/2/common' });

const objectClient = secure
    ? xmlrpc.createSecureClient({ host, port, path: '/xmlrpc/2/object' })
    : xmlrpc.createClient({ host, port, path: '/xmlrpc/2/object' });

function authenticate() {
    return new Promise((resolve, reject) => {
        commonClient.methodCall(
            'authenticate',
            [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}],
            (error, uid) => {
                if (error) reject(error);
                else resolve(uid);
            }
        );
    });
}

async function run() {
    try {
        const uid = await authenticate();
        console.log('Authenticated, UID:', uid);

        // List all sale.order.type
        // Note: The model name might be 'sale.order.type' based on inspecting inspect_type.js
        // If that model doesn't exist, we'll error, but worth a try.

        const model = 'sale.order.type';

        objectClient.methodCall(
            'execute_kw',
            [
                ODOO_CONFIG.db,
                uid,
                ODOO_CONFIG.password,
                model,
                'search_read',
                [[]], // All records
                { fields: ['name'] }
            ],
            (err, types) => {
                if (err) {
                    console.error('Error fetching types:', err);
                    // Fallback: check columns of sale.order again or list distinct type_ids from sale.order
                } else {
                    console.log('Order Types found:', types);
                }
            }
        );

    } catch (error) {
        console.error('Fatal error:', error);
    }
}

run();
