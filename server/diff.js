// Pure functions: order snapshots, change detection and priority rules.
const { madridDateStr, madridDayRanges, weekdayName } = require('./dates');

const PRIORITY_RANK = { info: 0, normal: 1, alto: 2, critico: 3 };
const DAY_LABEL = { past: 'Pasado', today: 'Hoy', tomorrow: 'Mañana', dayAfter: 'Pasado mañana', upcoming: 'Próximos días', later: 'Más adelante' };

// Label for an alert: the column title («Hoy», «Mañana», «Lunes»…) or «Jueves 22» for «Próximos días»
function dayLabelOf(deliveryIso, now = new Date()) {
  const key = dayKeyOf(deliveryIso, now);
  if (!deliveryIso || key === 'past' || key === 'later') return DAY_LABEL[key];
  if (key === 'upcoming') {
    const ymd = madridDateStr(new Date(deliveryIso));
    return `${weekdayName(ymd)} ${Number(ymd.slice(8))}`;
  }
  return madridDayRanges(now).find(r => r.key === key).title;
}

function cleanProductName(name) {
  return (name || '').replace(/^\[[^\]]*\]\s*/, '');
}

function lineKind(l) {
  if (l.display_type === 'line_section') return 'section';
  if (l.display_type === 'line_note' || !Array.isArray(l.product_id) || l.product_id.length === 0) return 'note';
  return 'product';
}

// Normalized, comparable view of an order (as built by fetchOrders)
function toSnapshot(order) {
  return {
    id: order.id,
    name: order.name,
    partner: Array.isArray(order.partner_id) ? order.partner_id[1] : '',
    typeId: Array.isArray(order.type_id) ? order.type_id[0] : null,
    deliveryDate: order.deliveryDate,
    state: order.state,
    pickingStatus: order.pickingStatus,
    lines: (order.lines || []).map(l => {
      const kind = lineKind(l);
      if (kind !== 'product') return { id: l.id, kind, text: l.name || '' };
      return {
        id: l.id,
        kind,
        productId: l.product_id[0],
        product: cleanProductName(l.product_id[1]),
        qty: Number(l.product_uom_qty) || 0,
        bultos: Number(l.product_packaging_qty) || 0,
        uom: Array.isArray(l.product_uom) ? l.product_uom[1] : '',
      };
    }),
  };
}

// Column of a delivery date, seen from `now`: 'today' | 'tomorrow' | 'dayAfter' (next working days,
// Sunday skipped) | 'upcoming' (Próximos días) | 'past' | 'later'
function dayKeyOf(deliveryIso, now = new Date()) {
  if (!deliveryIso) return 'later';
  const t = new Date(deliveryIso);
  const ranges = madridDayRanges(now);
  if (t < ranges[0].startUtc) return 'past';
  return ranges.find(r => t >= r.startUtc && t < r.endUtc)?.key || 'later';
}

const sameNumber = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-6;

function diffLines(prevLines, currLines) {
  const changes = [];
  const prevProducts = prevLines.filter(l => l.kind === 'product');
  const currProducts = currLines.filter(l => l.kind === 'product');

  const currById = new Map(currProducts.map(l => [l.id, l]));
  const matchedCurr = new Set();
  const unmatchedPrev = [];

  for (const p of prevProducts) {
    const c = currById.get(p.id);
    if (c && c.productId === p.productId) { matchedCurr.add(c.id); comparePair(p, c); }
    else unmatchedPrev.push(p);
  }

  // A line deleted and re-created with the same product is a quantity change, not remove+add
  const unmatchedCurr = currProducts.filter(c => !matchedCurr.has(c.id));
  for (const p of unmatchedPrev) {
    const idx = unmatchedCurr.findIndex(c => c.productId === p.productId);
    if (idx >= 0) {
      comparePair(p, unmatchedCurr[idx]);
      unmatchedCurr.splice(idx, 1);
    } else {
      changes.push({ type: 'LINEA_ELIMINADA', productId: p.productId, product: p.product, before: pick(p), after: null });
    }
  }
  for (const c of unmatchedCurr) {
    changes.push({ type: 'LINEA_AÑADIDA', lineId: c.id, productId: c.productId, product: c.product, before: null, after: pick(c) });
  }

  // Notes / sections: report text changes as one aggregated change
  const notesText = (lines) => lines.filter(l => l.kind !== 'product').map(l => l.text.trim()).filter(Boolean).join('\n');
  const prevNotes = notesText(prevLines);
  const currNotes = notesText(currLines);
  if (prevNotes !== currNotes) changes.push({ type: 'NOTA_CAMBIADA', before: prevNotes, after: currNotes });

  return changes;

  function comparePair(p, c) {
    if (sameNumber(p.qty, c.qty) && sameNumber(p.bultos, c.bultos)) return;
    const up = !sameNumber(p.qty, c.qty) ? c.qty > p.qty : c.bultos > p.bultos;
    changes.push({ type: up ? 'AUMENTO' : 'DISMINUCION', lineId: c.id, productId: c.productId, product: c.product, before: pick(p), after: pick(c) });
  }
}

const pick = (l) => ({ qty: l.qty, bultos: l.bultos, uom: l.uom });

// Changes between two snapshots of the same order. prev = null means a new order.
function diffOrder(prev, curr) {
  if (!prev) return [{ type: 'NUEVO_PEDIDO' }];
  const changes = [];

  if (curr.state === 'cancel' && prev.state !== 'cancel') return [{ type: 'CANCELADO' }];
  if (curr.state === 'eliminado') return [{ type: 'CANCELADO', reason: 'eliminado' }];
  if (curr.state === 'presupuesto') return [{ type: 'CANCELADO', reason: 'devuelto a presupuesto' }];
  if (prev.state === 'cancel' && curr.state !== 'cancel') changes.push({ type: 'REACTIVADO' });

  if (prev.deliveryDate !== curr.deliveryDate &&
      madridDateStr(new Date(prev.deliveryDate)) !== madridDateStr(new Date(curr.deliveryDate))) {
    changes.push({ type: 'CAMBIO_FECHA', before: prev.deliveryDate, after: curr.deliveryDate });
  }

  changes.push(...diffLines(prev.lines, curr.lines));

  if (prev.pickingStatus !== 'validado' && curr.pickingStatus === 'validado') {
    changes.push({ type: 'ALBARAN_VALIDADO' });
  }
  return changes;
}

const CONTENT_REDUCTIONS = new Set(['LINEA_ELIMINADA', 'DISMINUCION', 'CANCELADO']);

// Priority of a single change. ctx: { dayKey, prevDayKey, wasValidated }
function changePriority(change, ctx) {
  if (change.type === 'ALBARAN_VALIDADO') return 'info';
  // Already loaded/validated: anything that alters it must be reviewed now
  if (ctx.wasValidated) return 'critico';

  const days = [ctx.dayKey];
  if (change.type === 'CAMBIO_FECHA' && ctx.prevDayKey) days.push(ctx.prevDayKey);
  if (days.includes('today')) return 'critico';
  if (days.includes('tomorrow')) {
    if (change.type === 'CAMBIO_FECHA' || CONTENT_REDUCTIONS.has(change.type)) return 'alto';
    return 'normal';
  }
  return 'normal';
}

function maxPriority(priorities) {
  return priorities.reduce((best, p) => (PRIORITY_RANK[p] > PRIORITY_RANK[best] ? p : best), 'info');
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function amount(v, useBultos = !!v?.bultos) {
  if (!v) return '';
  return useBultos ? `${fmtNum(v.bultos)} bultos` : `${fmtNum(v.qty)} ${v.uom || ''}`.trim();
}

// Express a change in bultos when they changed, otherwise in the sale unit
const bultosChanged = (before, after) => before.bultos && after.bultos && !sameNumber(before.bultos, after.bultos);

function quantityChange(before, after) {
  const useBultos = bultosChanged(before, after);
  const d = useBultos ? after.bultos - before.bultos : after.qty - before.qty;
  const unit = useBultos ? 'bultos' : (after.uom || '');
  return `${amount(before, useBultos)} → ${amount(after, useBultos)} (${d > 0 ? '+' : ''}${fmtNum(d)} ${unit})`.replace(/ \)$/, ')');
}

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
}

function describeChange(c) {
  switch (c.type) {
    case 'NUEVO_PEDIDO': return 'Pedido nuevo';
    case 'CANCELADO': return c.reason ? `Pedido anulado (${c.reason})` : 'Pedido cancelado';
    case 'REACTIVADO': return 'Pedido reactivado';
    case 'CAMBIO_FECHA': return `Fecha cambiada: ${fmtDay(c.before)} → ${fmtDay(c.after)}`;
    case 'LINEA_AÑADIDA': return `+ ${c.product}: ${amount(c.after)}`;
    case 'LINEA_ELIMINADA': return `− ${c.product} eliminado (${amount(c.before)})`;
    case 'AUMENTO':
    case 'DISMINUCION': return `${c.product}: ${quantityChange(c.before, c.after)}`;
    case 'NOTA_CAMBIADA': return 'Notas del pedido modificadas';
    case 'ALBARAN_VALIDADO': return 'Albarán validado';
    default: return c.type;
  }
}

// Build a notification event from a grouped change (baseline → latest)
function buildEvent(baseline, latest, now = new Date()) {
  const changes = diffOrder(baseline, latest);
  if (changes.length === 0) return null;

  const dayKey = dayKeyOf(latest.deliveryDate, now);
  const ctx = {
    dayKey,
    prevDayKey: baseline ? dayKeyOf(baseline.deliveryDate, now) : null,
    wasValidated: !!baseline && ['validado', 'parcial'].includes(baseline.pickingStatus),
  };
  const withPriority = changes.map(c => ({ ...c, priority: changePriority(c, ctx), text: describeChange(c) }));
  const priority = maxPriority(withPriority.map(c => c.priority));

  return {
    id: `${latest.id}-${now.getTime()}`,
    ts: now.toISOString(),
    orderId: latest.id,
    orderName: latest.name,
    partner: latest.partner,
    typeId: latest.typeId,
    dayKey,
    dayLabel: dayLabelOf(latest.deliveryDate, now),
    deliveryDate: latest.deliveryDate,
    wasValidated: ctx.wasValidated,
    priority,
    changes: withPriority,
    summary: withPriority.map(c => c.text).join(' · '),
  };
}

module.exports = {
  toSnapshot, diffOrder, diffLines, changePriority, buildEvent, dayKeyOf, dayLabelOf, describeChange,
  PRIORITY_RANK, DAY_LABEL,
};
