const { executeKw } = require('./odoo');
const { addDays, madridDateStr } = require('./dates');

// Camiones de patata granel pendientes de llegar, para el calendario «Camiones» (2026-11-09).
// Mismos camiones que «Compras pendientes de recibir» de Odoo (App Compras Gerencia) y que el
// informe PDF «Camiones pendientes»: compras confirmadas de 01GRBA/01GRRO cuyo camión no ha llegado
// del todo. Llegada prevista = fecha de carga + 2 días (el usuario: tarda entre 1,5 y 2 días; en el
// calendario «dándole 2 días»). Solo lectura.
const DOMAIN = [
  ['state', 'in', ['purchase', 'done']],
  ['receipt_status', 'in', ['pending', 'partial']],
  ['x_studio_transporte', '=', false],
  ['order_line.product_id.default_code', 'in', ['01GRBA', '01GRRO']],
];
const FIELDS = ['name', 'partner_id', 'x_studio_variedad', 'x_variedad_id', 'x_deca_transportista_id',
  'x_studio_fecha_de_carga', 'receipt_status'];
const TRANSIT_DAYS = 2;
const CACHE_MS = Number(process.env.TRUCKS_CACHE_MS) || 2 * 60_000;

const name = (m2o) => (Array.isArray(m2o) ? m2o[1] : '') || '';

// Odoo row -> camión del calendario
function toTruck(row) {
  const loadDate = row.x_studio_fecha_de_carga || null;
  return {
    id: row.id,
    name: row.name,
    variety: name(row.x_variedad_id) || row.x_studio_variedad || '',
    supplier: name(row.partner_id),
    carrier: name(row.x_deca_transportista_id),
    loadDate,
    arrivalDate: loadDate ? addDays(loadDate, TRANSIT_DAYS) : null,
    partial: row.receipt_status === 'partial',
  };
}

let cache = { at: 0, data: null };
let inFlight = null;

async function fetchTrucks(now = Date.now()) {
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  inFlight ||= executeKw('purchase.order', 'search_read', [DOMAIN],
    { fields: FIELDS, order: 'x_studio_fecha_de_carga asc, id asc' })
    .then(rows => {
      cache = {
        at: Date.now(),
        data: { trucks: rows.map(toTruck), transitDays: TRANSIT_DAYS, today: madridDateStr(new Date()), fetchedAt: new Date().toISOString() },
      };
      return cache.data;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = { fetchTrucks, toTruck, TRANSIT_DAYS };
