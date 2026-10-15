const { executeKw } = require('./odoo');

// Employees of the Navalcarnero plant: hr.employee with work location "Navalcarnero" (id 1)
const LOCATION_ID = Number(process.env.EMPLOYEE_LOCATION_ID) || 1;
const CACHE_MS = 10 * 60_000;

let cache = { at: 0, list: [] };

async function fetchEmployees(now = Date.now()) {
  if (cache.list.length && now - cache.at < CACHE_MS) return cache.list;
  const rows = await executeKw('hr.employee', 'search_read',
    [[['work_location_id', '=', LOCATION_ID]]], { fields: ['name', 'department_id'], order: 'name asc' });
  cache = {
    at: now,
    list: rows.map(r => ({ id: r.id, name: r.name, department: Array.isArray(r.department_id) ? r.department_id[1] : '' })),
  };
  return cache.list;
}

module.exports = { fetchEmployees };
