// Buscador del panel: filtra pedidos por cliente, número de pedido o producto.
// Sin distinguir mayúsculas ni acentos. Varias palabras = todas tienen que aparecer
// (en el cliente/pedido o en una misma línea de producto: «reina 5 kg»).

export const normalize = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();

const isProductLine = (l) => !l.display_type && Array.isArray(l.product_id) && l.product_id.length > 0;

const lineText = (l) => normalize([
  l.product_id[1],
  Array.isArray(l.product_packaging_id) ? l.product_packaging_id[1] : '',
].join(' '));

/**
 * null si el pedido no coincide. Si coincide: { lineIds } con las líneas de producto que
 * casan con la búsqueda (vacío cuando casa por cliente o número de pedido).
 */
export function matchOrder(order, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return { lineIds: new Set() };

  const head = normalize(`${order.name || ''} ${order.partner_id?.[1] || ''} ${order.client_order_ref || ''}`);
  const rest = terms.filter(t => !head.includes(t));
  if (!rest.length) return { lineIds: new Set() };

  const lines = (order.lines || []).filter(isProductLine).filter(l => {
    const text = lineText(l);
    return rest.every(t => text.includes(t));
  });
  return lines.length ? { lineIds: new Set(lines.map(l => l.id)) } : null;
}

/** Pedidos que coinciden, con `searchLineIds` en los que casaron por producto. */
export function filterOrders(orders, query) {
  if (!normalize(query).trim()) return orders;
  const out = [];
  for (const o of orders) {
    const m = matchOrder(o, query);
    if (!m) continue;
    out.push(m.lineIds.size ? { ...o, searchLineIds: m.lineIds } : o);
  }
  return out;
}
