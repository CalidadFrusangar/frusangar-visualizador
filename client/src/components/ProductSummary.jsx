import React from 'react';

const isProductLine = (l) => !l.display_type && Array.isArray(l.product_id) && l.product_id.length > 0;
const fmt = (n, digits = 0) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: digits });

// Totals per product + packaging for the active (not cancelled) orders of a day
function summarizeProducts(orders) {
    const rows = new Map();
    for (const o of orders) {
        if (o.state === 'cancel') continue;
        const pending = o.pickingStatus !== 'validado';
        for (const l of (o.lines || []).filter(isProductLine)) {
            const packaging = Array.isArray(l.product_packaging_id) && l.product_packaging_id.length ? l.product_packaging_id[1] : '';
            const key = `${l.product_id[0]}|${packaging}`;
            if (!rows.has(key)) {
                const name = l.product_id[1];
                const ref = name.match(/\[([^\]]+)\]/)?.[1] || '';
                rows.set(key, {
                    key, ref, packaging,
                    name: name.split('] ')[1] || name,
                    uom: Array.isArray(l.product_uom) ? l.product_uom[1] : '',
                    bultos: 0, pendingBultos: 0, qty: 0, palets: 0, orders: new Set(),
                });
            }
            const r = rows.get(key);
            r.bultos += l.product_packaging_qty || 0;
            r.qty += l.product_uom_qty || 0;
            r.palets += l.palet_qty || 0;
            if (pending) r.pendingBultos += l.product_packaging_qty || 0;
            r.orders.add(o.id);
        }
    }
    return [...rows.values()].sort((a, b) => b.bultos - a.bultos || b.qty - a.qty);
}

const ProductSummary = ({ orders }) => {
    const rows = summarizeProducts(orders);
    if (rows.length === 0) {
        return (
            <div className="bg-white/50 p-10 rounded-xl text-center border-dashed border-2 border-stone-200">
                <p className="text-stone-500 font-medium">No hay productos para este día.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-card border border-stone-100/80 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead>
                        <tr className="border-b border-stone-200/60 text-stone-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Producto / Empaquetado</th>
                            <th className="py-3 px-2 text-right">Bultos</th>
                            <th className="py-3 px-2 text-right" title="Bultos de pedidos con el albarán aún sin validar">Por preparar</th>
                            <th className="py-3 px-2 text-right">Cantidad</th>
                            <th className="py-3 px-4 text-right">Pedidos</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.map(r => (
                            <tr key={r.key} className="hover:bg-frusangar-light/40">
                                <td className="py-2.5 px-4 align-top">
                                    <div className="font-bold text-stone-800">{r.name}</div>
                                    <div className="text-[11px] text-stone-500">
                                        {r.ref && <span className="font-mono">{r.ref}</span>}
                                        {r.ref && r.packaging && ' · '}
                                        {r.packaging}
                                    </div>
                                </td>
                                <td className="py-2.5 px-2 text-right font-black text-frusangar-dark text-sm">{r.bultos ? fmt(r.bultos, 1) : '-'}</td>
                                <td className={`py-2.5 px-2 text-right font-bold ${r.pendingBultos ? 'text-frusangar-orange' : 'text-emerald-600'}`}>
                                    {r.bultos ? (r.pendingBultos ? fmt(r.pendingBultos, 1) : '✔') : '-'}
                                </td>
                                <td className="py-2.5 px-2 text-right text-stone-600 whitespace-nowrap">{fmt(r.qty, 2)} {r.uom}</td>
                                <td className="py-2.5 px-4 text-right text-stone-500">{r.orders.size}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ProductSummary;
