const express = require('express');
const xmlrpc = require('xmlrpc');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const ODOO_CONFIG = {
  url: process.env.ODOO_URL,
  db: process.env.ODOO_DB,
  username: process.env.ODOO_USER,
  password: process.env.ODOO_PASSWORD,
};

// Helper: split URL for xmlrpc
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

let uid = 0;

// Authenticate once on startup (simple approach) or per request
function authenticate() {
  return new Promise((resolve, reject) => {
    commonClient.methodCall(
      'authenticate',
      [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}],
      (error, value) => {
        if (error) {
          console.error('Odoo Auth Error:', error);
          reject(error);
        } else {
          console.log(`Authenticated with Odoo. UID: ${value}`);
          uid = value;
          resolve(value);
        }
      }
    );
  });
}

// Routes
app.get('/api/orders', async (req, res) => {
  if (!uid) {
    try {
      await authenticate();
    } catch (e) {
      return res.status(500).json({ error: 'Authentication failed' });
    }
  }

  // Calculate dates: Tomorrow and Day After
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  // Format YYYY-MM-DD
  const fmt = (d) => d.toISOString().split('T')[0];
  const tomorrowStr = fmt(tomorrow);
  const dayAfterStr = fmt(dayAfter);

  // Domain: Delivery Date (commitment_date or date_deadline) is within range
  // And state is likely 'sale' or 'done' (not canceled/draft)
  // We'll search for [tomorrow_start, dayAfter_end]

  // Note: Odoo stores dates in UTC. Simple string match on date part might miss if timezone differs.
  // For MVP, we'll try to match the day string if stored as date, or range if datetime.
  // Using 'commitment_date' (Delivery Date). 

  const domain = [
    ['state', 'in', ['sale', 'done']],
    '|',
    ['commitment_date', '>=', tomorrowStr + ' 00:00:00'],
    ['commitment_date', '<=', dayAfterStr + ' 23:59:59']
  ];

  // Actually, we want specifically Tomorrow OR DayAfter.
  // Let's just fetch bigger range and filter in JS to be precise with "Next Day" logic
  // or use stricter domains.

  // Simplify: Fetch everything >= tomorrow 00:00:00 and <= dayAfter 23:59:59
  const searchDomain = [
    ['state', 'in', ['sale', 'done']],
    ['commitment_date', '>=', tomorrowStr + ' 00:00:00'],
    ['commitment_date', '<=', dayAfterStr + ' 23:59:59']
  ];

  const fields = ['name', 'partner_id', 'commitment_date', 'order_line', 'state'];

  objectClient.methodCall(
    'execute_kw',
    [
      ODOO_CONFIG.db,
      uid,
      ODOO_CONFIG.password,
      'sale.order',
      'search_read',
      [searchDomain, fields],
    ],
    async (err, orders) => {
      if (err) {
        console.error('Search Error:', err);
        return res.status(500).json({ error: err });
      }

      // Now fetch order lines details for these orders
      // Collect all line IDs
      const lineIds = orders.flatMap(o => o.order_line);

      if (lineIds.length === 0) {
        return res.json({ tomorrow: [], dayAfter: [] });
      }

      // Fetch lines
      objectClient.methodCall(
        'execute_kw',
        [
          ODOO_CONFIG.db,
          uid,
          ODOO_CONFIG.password,
          'sale.order.line',
          'read',
          [lineIds, ['product_id', 'product_uom_qty', 'product_uom', 'name', 'order_id', 'product_packaging_id', 'product_packaging_qty', 'palet_id', 'palet_qty']],
        ],
        (err2, lines) => {
          if (err2) {
            console.error('Line Read Error:', err2);
            return res.status(500).json({ error: err2 });
          }

          // Map lines back to orders
          const ordersWithLines = orders.map(order => {
            const orderLines = lines.filter(l => l.order_id[0] === order.id);
            return { ...order, lines: orderLines };
          });

          // Split into Tomorrow and Day After
          const tomorrowOrders = [];
          const dayAfterOrders = [];

          ordersWithLines.forEach(o => {
            const date = o.commitment_date ? o.commitment_date.split(' ')[0] : '';
            if (date === tomorrowStr) tomorrowOrders.push(o);
            if (date === dayAfterStr) dayAfterOrders.push(o);
            // Also handle timezone overlap if needed? For now strict string match on UTC date.
          });

          res.json({
            tomorrow: tomorrowOrders,
            dayAfter: dayAfterOrders,
            dates: { tomorrow: tomorrowStr, dayAfter: dayAfterStr }
          });
        }
      );
    }
  );
});

const path = require('path');

// ... existing code ...

const PORT = process.env.PORT || 3000;

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  authenticate();
  console.log(`Server running on port ${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://192.168.1.235:${PORT}`);
});
