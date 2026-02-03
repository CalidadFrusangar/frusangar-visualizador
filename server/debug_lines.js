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

const objectClient = secure
    ? xmlrpc.createSecureClient({ host, port, path: '/xmlrpc/2/object' })
    : xmlrpc.createClient({ host, port, path: '/xmlrpc/2/object' });

const commonClient = secure
    ? xmlrpc.createSecureClient({ host, port, path: '/xmlrpc/2/common' })
    : xmlrpc.createClient({ host, port, path: '/xmlrpc/2/common' });

async function debug() {
    commonClient.methodCall(
        'authenticate',
        [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}],
        (error, uid) => {
            if (error) { console.error(error); return; }

            console.log('Finding NO PRODUCT lines...');

            const domain = [['product_id', '=', false]];

            objectClient.methodCall(
                'execute_kw',
                [
                    ODOO_CONFIG.db, uid, ODOO_CONFIG.password,
                    'sale.order.line', 'search_read',
                    [domain],
                    { fields: ['name', 'product_id', 'display_type'], limit: 3 }
                ],
                (err, lines) => {
                    if (err) { console.error(err); return; }
                    lines.forEach((line, i) => {
                        console.log(`LINE_${i}_ID: ${line.id}`);
                        console.log(`LINE_${i}_NAME: ${line.name.replace(/\n/g, ' ')}`);
                        console.log(`LINE_${i}_DISPLAY_TYPE: ${line.display_type}`);
                        console.log(`LINE_${i}_PRODUCT_ID_TYPE: ${typeof line.product_id}`);
                        console.log(`LINE_${i}_PRODUCT_ID_VAL: ${JSON.stringify(line.product_id)}`);
                        console.log('---');
                    });
                }
            );
        }
    );
}

debug();
