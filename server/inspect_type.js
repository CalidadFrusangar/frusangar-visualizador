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

const client = urlParts.protocol === 'https:'
    ? xmlrpc.createSecureClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/object' })
    : xmlrpc.createClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/object' });

const common = urlParts.protocol === 'https:'
    ? xmlrpc.createSecureClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/common' })
    : xmlrpc.createClient({ host: urlParts.hostname, port, path: '/xmlrpc/2/common' });

function authenticate() {
    return new Promise((resolve, reject) => {
        common.methodCall('authenticate', [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}], (err, uid) => {
            if (err) reject(err);
            else resolve(uid);
        });
    });
}

async function inspect() {
    try {
        const uid = await authenticate();
        console.log('Authenticated:', uid);

        // 1. Inspect fields of sale.order to find type_id
        client.methodCall('execute_kw', [
            ODOO_CONFIG.db, uid, ODOO_CONFIG.password,
            'sale.order', 'fields_get',
            [],
            { attributes: ['string', 'type', 'relation'] }
        ], (err, fields) => {
            if (err) return console.error(err);

            const typeFields = Object.keys(fields).filter(k => k.includes('type'));
            console.log('Fields with "type" in name:', typeFields);

            // Check for sale.order.type relation specifically
            const orderTypeFields = Object.keys(fields).filter(k => fields[k].relation === 'sale.order.type');
            console.log('Fields strictly related to sale.order.type:', orderTypeFields);

            // Using the identified field (prioritizing strict relation)
            let typeField = orderTypeFields.length > 0 ? orderTypeFields[0] : null;
            if (!typeField && typeFields.includes('type_id')) typeField = 'type_id';

            if (typeField) {
                console.log(`Using field: ${typeField}`);

                // Verify ID=5 exists in sale.order.type (assuming we can read it)
                // We can't easily read sale.order.type directly if we don't know permissions, but let's try.

                // Now, Search for orders with this type ID 5
                const domain = [[typeField, '=', 5]];
                client.methodCall('execute_kw', [
                    ODOO_CONFIG.db, uid, ODOO_CONFIG.password,
                    'sale.order', 'search_read',
                    [domain],
                    { fields: ['name', 'state', 'commitment_date', typeField], limit: 5 }
                ], (err, orders) => {
                    if (err) console.error('Error searching orders with type 5:', err);
                    else console.log('Sample Internal Orders (Type 5):', orders);
                });
            } else {
                console.log("Could not identify exact type field.");
            }

        });

    } catch (e) {
        console.error(e);
    }
}

inspect();
