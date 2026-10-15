const { executeKw } = require('./odoo');
const { fromOdooUtc } = require('./dates');

// Returnable box products in Odoo, same catalogue as the "PEDIR EN GO RAMP EUROPOOL" project
// (declaracion.RETURNABLE_BOXES). A delivery note must be declared when the lots it ships come
// from manufacturing orders that used one of these boxes.
const RETURNABLE_BOXES = {
  4121: 'Euro Pool 136',
  4107: 'Euro Pool 156',
  4149: 'Euro Pool 186',
  3962: 'Euro Pool 24603',
  3966: 'IFCO LL6424',
  4368: 'IFCO LL6413',
  4111: 'IFCO LL6418',
  4045: 'IFCO Black 6424',
};

// Done pickings rarely change; write_date in the key refreshes them when they do
const cache = new Map();

/** Returnable box labels per validated outgoing picking id: { [pickingId]: ['Euro Pool 156', ...] } */
async function boxesByPicking(pickings) {
  const done = pickings.filter(p => p.picking_type_code === 'outgoing' && p.state === 'done');
  const key = (p) => `${p.id}:${p.write_date}`;
  const missing = done.filter(p => !cache.has(key(p)));

  if (missing.length) {
    const moveLines = await executeKw('stock.move.line', 'search_read',
      [[['picking_id', 'in', missing.map(p => p.id)], ['lot_id', '!=', false]]], { fields: ['picking_id', 'lot_id'] });
    const lotIds = [...new Set(moveLines.map(l => l.lot_id[0]))];
    const productions = lotIds.length ? await executeKw('mrp.production', 'search_read',
      [[['lot_producing_id', 'in', lotIds], ['state', '=', 'done']]], { fields: ['lot_producing_id'] }) : [];
    // Cancelled box lines count too: the box model is the one planned in the MO
    const raws = productions.length ? await executeKw('stock.move', 'search_read',
      [[['raw_material_production_id', 'in', productions.map(p => p.id)], ['product_id', 'in', Object.keys(RETURNABLE_BOXES).map(Number)]]],
      { fields: ['raw_material_production_id', 'product_id'] }) : [];

    const boxesByProduction = new Map();
    for (const r of raws) {
      const id = r.raw_material_production_id[0];
      if (!boxesByProduction.has(id)) boxesByProduction.set(id, new Set());
      boxesByProduction.get(id).add(RETURNABLE_BOXES[r.product_id[0]]);
    }
    const boxesByLot = new Map();
    for (const p of productions) {
      const lot = p.lot_producing_id[0];
      if (!boxesByLot.has(lot)) boxesByLot.set(lot, boxesByProduction.get(p.id) || new Set());
    }
    for (const p of missing) {
      const labels = new Set();
      for (const l of moveLines) {
        if (l.picking_id[0] === p.id) for (const b of boxesByLot.get(l.lot_id[0]) || []) labels.add(b);
      }
      cache.set(key(p), [...labels].sort());
    }
  }

  return Object.fromEntries(done.map(p => [p.id, cache.get(key(p))]));
}

/**
 * Returnable box declaration status of an order, from its validated outgoing delivery notes:
 *  declarada    — every delivery note with returnable boxes has x_cajas_declaradas
 *  sin_declarar — some delivery note with returnable boxes is not declared yet
 *  null         — nothing to declare (no returnable boxes, or not validated yet)
 */
function boxStatus(pickings, boxesById) {
  const withBoxes = pickings.filter(p => boxesById[p.id]?.length || (p.state === 'done' && p.x_cajas_declaradas));
  if (!withBoxes.length) return null;
  const declared = withBoxes.filter(p => p.x_cajas_declaradas);
  const undeclared = withBoxes.filter(p => !p.x_cajas_declaradas);
  return {
    status: undeclared.length ? 'sin_declarar' : 'declarada',
    boxes: [...new Set(withBoxes.flatMap(p => boxesById[p.id] || []))],
    detail: declared.map(p => p.x_cajas_declaracion).filter(Boolean),
    undeclared: undeclared.map(p => ({
      id: p.id,
      name: p.name,
      boxes: boxesById[p.id] || [],
      doneAt: p.date_done ? fromOdooUtc(p.date_done).toISOString() : null,
    })),
  };
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

/**
 * Events for delivery notes with returnable boxes still undeclared `afterMs` after validation.
 * `alerted` = { [pickingId]: isoDate } of notes already notified (mutated: one alert per note).
 */
function boxAlertEvents(ordersByDay, alerted, now = new Date(), afterMs = 120 * 60_000, dayLabels = {}) {
  const events = [];
  for (const [dayKey, list] of Object.entries(ordersByDay)) {
    for (const o of list) {
      if (o.state === 'cancel') continue;
      for (const p of o.boxes?.undeclared || []) {
        if (!p.doneAt || alerted[p.id] || now - new Date(p.doneAt) < afterMs) continue;
        alerted[p.id] = now.toISOString();
        const text = `${p.boxes.join(' / ') || 'Cajas retornables'} sin declarar · albarán ${p.name} validado a las ${hhmm(p.doneAt)}`;
        events.push({
          id: `${o.id}-cajas-${p.id}`,
          ts: now.toISOString(),
          orderId: o.id,
          orderName: o.name,
          partner: o.partner_id?.[1] || '',
          typeId: o.type_id?.[0] ?? null,
          dayKey,
          dayLabel: dayLabels[dayKey] || dayKey,
          deliveryDate: o.deliveryDate,
          wasValidated: false,
          priority: 'alto',
          changes: [{ type: 'CAJAS_SIN_DECLARAR', priority: 'alto', text }],
          summary: text,
        });
      }
    }
  }
  return events;
}

// Forget notes alerted more than a week ago
function pruneAlerted(alerted, now = new Date()) {
  for (const [id, ts] of Object.entries(alerted)) if (now - new Date(ts) > 7 * 24 * 3600_000) delete alerted[id];
}

module.exports = { boxesByPicking, boxStatus, boxAlertEvents, pruneAlerted, RETURNABLE_BOXES };
