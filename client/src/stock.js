// Finished-goods stock (almacén 4) shared out across the day columns: it covers what is still to be
// prepared today first, what is left covers the next column, and so on.

const isProductLine = (l) => !l.display_type && Array.isArray(l.product_id) && l.product_id.length > 0;

// Quantity still to prepare per product (orders not cancelled and with the delivery note not done)
export function pendingQtyByProduct(orders) {
    const pending = new Map();
    for (const o of orders) {
        if (o.state === 'cancel' || o.pickingStatus === 'validado') continue;
        for (const l of (o.lines || []).filter(isProductLine)) {
            pending.set(l.product_id[0], (pending.get(l.product_id[0]) || 0) + (l.product_uom_qty || 0));
        }
    }
    return pending;
}

/**
 * Stock of almacén 4 available to each column, after the columns before it took theirs.
 * Returns { [dayKey]: Map(productId -> qty) }, or null when the stock could not be read.
 */
export function stockByDay(dayKeys, ordersOf, stock) {
    if (!stock?.byProduct) return null;
    // Only products made in the plant (with a bill of materials); the rest (e.g. ABONO) are left out
    const left = new Map((stock.manufactured || []).map(id => [id, stock.byProduct[id]?.qty || 0]));
    const result = {};
    for (const key of dayKeys) {
        result[key] = new Map(left);
        for (const [productId, qty] of pendingQtyByProduct(ordersOf(key))) {
            if (left.has(productId)) left.set(productId, Math.max(0, left.get(productId) - qty));
        }
    }
    return result;
}

/**
 * Shares the column's stock among its product rows (same product with different packagings
 * share one stock). Adds `available` (stock before this row) and `missing` (qty still to make).
 */
export function withShortages(rows, available) {
    if (!available) return rows;
    const left = new Map(available);
    return rows.map(r => {
        if (!left.has(r.productId)) return { ...r, missing: null }; // not manufactured here
        const before = left.get(r.productId);
        const covered = Math.min(before, r.pendingQty);
        left.set(r.productId, before - covered);
        return { ...r, available: before, missing: r.pendingQty - covered };
    });
}

// Missing quantity in bultos, using the row's own qty-per-bulto; null when the row has no packaging
export const missingBultos = (r) => (r.bultos && r.qty ? r.missing / (r.qty / r.bultos) : null);

// Kg per unit of a row (from the product weights on its lines); null when some line has no weight
export const kgPerUnit = (r) => (!r.kgMissing && r.qty ? r.kg / r.qty : null);

// Missing quantity in kg; null when the weight is unknown
export const missingKg = (r) => {
    if (!(r.missing > 1e-6)) return 0;
    const k = kgPerUnit(r);
    return k == null ? null : r.missing * k;
};

/**
 * What a column still has to manufacture: { products, kg, kgUnknown } (kg = missing × product weight).
 * null when the stock could not be read.
 */
export function shortageSummary(orders, available) {
    if (!available) return null;
    const qty = new Map();
    const kg = new Map(); // productId -> kg of those lines, null when some line has no weight
    for (const o of orders) {
        if (o.state === 'cancel' || o.pickingStatus === 'validado') continue;
        for (const l of (o.lines || []).filter(isProductLine)) {
            const id = l.product_id[0];
            qty.set(id, (qty.get(id) || 0) + (l.product_uom_qty || 0));
            const prev = kg.has(id) ? kg.get(id) : 0;
            kg.set(id, prev == null || l.kg == null ? null : prev + l.kg);
        }
    }
    let products = 0;
    let totalKg = 0;
    let kgUnknown = false;
    for (const [id, q] of qty) {
        if (!available.has(id)) continue;
        const missing = q - available.get(id);
        if (missing <= 1e-6) continue;
        products++;
        if (kg.get(id) == null || !q) kgUnknown = true;
        else totalKg += missing * (kg.get(id) / q);
    }
    return { products, kg: totalKg, kgUnknown };
}
