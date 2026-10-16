import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { withShortages, missingBultos } from '../stock';

const isProductLine = (l) => !l.display_type && Array.isArray(l.product_id) && l.product_id.length > 0;
const fmt = (n, digits = 0) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: digits });

// Totals per product + packaging for the active (not cancelled) orders of a day,
// with the split per order (for the hover card / tap breakdown)
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
                    key, ref, packaging, productId: l.product_id[0], pendingQty: 0,
                    name: name.split('] ')[1] || name,
                    uom: Array.isArray(l.product_uom) ? l.product_uom[1] : '',
                    bultos: 0, pendingBultos: 0, qty: 0, kg: 0, pendingKg: 0, kgMissing: false, palets: 0, orders: new Map(),
                });
            }
            const r = rows.get(key);
            r.bultos += l.product_packaging_qty || 0;
            r.qty += l.product_uom_qty || 0;
            r.palets += l.palet_qty || 0;
            if (l.kg == null) r.kgMissing = true;
            else r.kg += l.kg;
            if (pending) {
                r.pendingQty += l.product_uom_qty || 0;
                r.pendingBultos += l.product_packaging_qty || 0;
                r.pendingKg += l.kg || 0;
            }

            if (!r.orders.has(o.id)) {
                r.orders.set(o.id, {
                    id: o.id,
                    name: o.name?.split(' ')[0] || o.name,
                    partner: Array.isArray(o.partner_id) ? o.partner_id[1] : '',
                    deliveryDate: o.deliveryDate,
                    pending,
                    bultos: 0, qty: 0, kg: 0, kgMissing: false,
                });
            }
            const share = r.orders.get(o.id);
            share.bultos += l.product_packaging_qty || 0;
            share.qty += l.product_uom_qty || 0;
            if (l.kg == null) share.kgMissing = true;
            else share.kg += l.kg;
        }
    }
    return [...rows.values()]
        .map(r => ({ ...r, split: [...r.orders.values()].sort((a, b) => b.bultos - a.bultos || b.qty - a.qty) }))
        .sort((a, b) => b.bultos - a.bultos || b.qty - a.qty);
}

// Kilos come from the product's «Peso» field in Odoo (kg per unit); "?" when a product has no weight
const kgCell = (kg, missing) => (missing && !kg ? '?' : `${fmt(kg)} kg${missing ? ' + ?' : ''}`);

const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');

// Share of the product per order, by bultos when the product has them, otherwise by quantity
const shareOf = (row, s) => {
    const total = row.bultos || row.qty;
    const part = row.bultos ? s.bultos : s.qty;
    return total ? Math.round((part / total) * 100) : 0;
};

const SplitList = ({ row, compact = false }) => (
    <table className="w-full text-[11px]">
        <thead>
            <tr className="text-stone-400 uppercase tracking-wider text-[9px] font-semibold">
                <th className="text-left py-1 pr-2">Pedido</th>
                <th className="text-right py-1 px-1">Bultos</th>
                <th className="text-right py-1 px-1">Cantidad</th>
                <th className="text-right py-1 pl-1">Kg</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
            {row.split.map(s => (
                <tr key={s.id} className={s.pending ? '' : 'text-stone-400'}>
                    <td className="py-1.5 pr-2 align-top">
                        <div className="flex items-center gap-1.5 font-bold text-stone-800">
                            <span title={s.pending ? 'Albarán pendiente' : 'Albarán hecho'}>{s.pending ? '⏳' : '✔'}</span>
                            <span className={s.pending ? '' : 'text-stone-400'}>{s.name}</span>
                            <span className="font-normal text-stone-400">{hhmm(s.deliveryDate)}</span>
                        </div>
                        <div className={`truncate ${compact ? 'max-w-[180px]' : 'max-w-[220px]'} ${s.pending ? 'text-stone-500' : 'text-stone-400'}`}>{s.partner}</div>
                        <div className="mt-1 h-1 rounded-full bg-stone-100 overflow-hidden">
                            <div className={`h-full ${s.pending ? 'bg-frusangar-orange' : 'bg-emerald-400'}`} style={{ width: `${shareOf(row, s)}%` }}></div>
                        </div>
                    </td>
                    <td className="py-1.5 px-1 text-right align-top font-black text-frusangar-dark">
                        {s.bultos ? fmt(s.bultos, 1) : '-'}
                        <div className="text-[9px] font-semibold text-stone-400">{shareOf(row, s)}%</div>
                    </td>
                    <td className="py-1.5 px-1 text-right align-top whitespace-nowrap">{fmt(s.qty, 2)} {row.uom}</td>
                    <td className="py-1.5 pl-1 text-right align-top whitespace-nowrap">{kgCell(s.kg, s.kgMissing)}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

const CARD_WIDTH = 400;

// Floating card next to the hovered row (fixed, so the table's scroll box does not clip it)
function cardPosition(rect, rows) {
    const height = Math.min(90 + rows * 52, window.innerHeight - 24);
    const left = rect.right + 8 + CARD_WIDTH <= window.innerWidth
        ? rect.right + 8
        : Math.max(8, rect.left - CARD_WIDTH - 8);
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - height - 12));
    return { left, top, maxHeight: window.innerHeight - 24 };
}

// «Fabricar» cell: what almacén 4 still has to receive for this row, after earlier days and rows
function MissingCell({ r }) {
    if (r.missing == null) return <span className="text-stone-300" title="No se fabrica en planta (sin lista de materiales en Odoo)">—</span>;
    if (!r.pendingQty) return <span className="text-emerald-600 font-bold" title="Todo el producto de este día ya está en albaranes hechos">✔</span>;
    const stockText = `Alm. 4: ${fmt(r.available, 2)} ${r.uom}`;
    if (r.missing <= 1e-6) {
        return (
            <span title={`Hay stock suficiente en el almacén 4 para lo pendiente (${stockText})`}>
                <span className="font-bold text-emerald-600">✔ Hay</span>
                <span className="block text-[10px] text-stone-400">{stockText}</span>
            </span>
        );
    }
    const b = missingBultos(r);
    return (
        <span title={`Pendiente ${fmt(r.pendingQty, 2)} ${r.uom} · ${stockText} disponible para este día`}>
            <span className="font-black text-red-600">{b != null ? `${fmt(Math.ceil(b - 1e-6))} b.` : `${fmt(r.missing, 2)} ${r.uom}`}</span>
            {b != null && <span className="block text-[10px] font-bold text-red-500">{fmt(r.missing, 2)} {r.uom}</span>}
            <span className="block text-[10px] text-stone-400">{stockText}</span>
        </span>
    );
}

// compact (4 columns on screen): «Por preparar» goes under Bultos and «Cantidad» under Kg
const ProductSummary = ({ orders, available = null, compact = false }) => {
    const [hover, setHover] = useState(null);   // { key, pos }
    const [openKey, setOpenKey] = useState(null);
    const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

    const rows = withShortages(summarizeProducts(orders), available);
    const showStock = !!available;
    const colCount = 4 + (compact ? 0 : 2) + (showStock ? 1 : 0);
    const totalMissingBultos = rows.reduce((sum, r) => sum + (r.missing > 1e-6 ? Math.ceil((missingBultos(r) ?? 0) - 1e-6) : 0), 0);
    const total = rows.reduce((t, r) => ({
        bultos: t.bultos + r.bultos,
        pendingBultos: t.pendingBultos + r.pendingBultos,
        kg: t.kg + r.kg,
        pendingKg: t.pendingKg + r.pendingKg,
        kgMissing: t.kgMissing || r.kgMissing,
    }), { bultos: 0, pendingBultos: 0, kg: 0, pendingKg: 0, kgMissing: false });
    if (rows.length === 0) {
        return (
            <div className="bg-white/50 p-10 rounded-xl text-center border-dashed border-2 border-stone-200">
                <p className="text-stone-500 font-medium">No hay productos para este día.</p>
            </div>
        );
    }

    const hoverRow = hover && openKey !== hover.key ? rows.find(r => r.key === hover.key) : null;

    return (
        <div className="bg-white rounded-xl shadow-card border border-stone-100/80 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead>
                        <tr className="border-b border-stone-200/60 text-stone-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Producto / Empaquetado</th>
                            <th className="py-3 px-2 text-right" title={compact ? 'Debajo, bultos con el albarán aún sin validar' : undefined}>Bultos</th>
                            {!compact && <th className="py-3 px-2 text-right" title="Bultos de pedidos con el albarán aún sin validar">Por preparar</th>}
                            {!compact && <th className="py-3 px-2 text-right">Cantidad</th>}
                            <th className="py-3 px-2 text-right" title="Cantidad × peso del producto en Odoo. Entre paréntesis, kg por preparar">Kg</th>
                            {showStock && (
                                <th className="py-3 px-2 text-right" title="Lo que falta por fabricar: pendiente de preparar menos el stock del almacén 4 (Productos terminados) que queda tras los días anteriores">Fabricar</th>
                            )}
                            <th className="py-3 px-4 text-right" title="Pasa el ratón o pulsa el producto para ver el reparto por pedido">Pedidos</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.map(r => {
                            const open = openKey === r.key;
                            return (
                                <React.Fragment key={r.key}>
                                    <tr
                                        className={`cursor-pointer ${open ? 'bg-frusangar-light/60' : 'hover:bg-frusangar-light/40'}`}
                                        onClick={() => { setOpenKey(open ? null : r.key); setHover(null); }}
                                        onMouseEnter={(e) => canHover && setHover({ key: r.key, pos: cardPosition(e.currentTarget.getBoundingClientRect(), r.split.length) })}
                                        onMouseLeave={() => setHover(null)}
                                    >
                                        <td className="py-2.5 px-4 align-top">
                                            <div className="font-bold text-stone-800">{r.name}</div>
                                            <div className="text-[11px] text-stone-500">
                                                {r.ref && <span className="font-mono">{r.ref}</span>}
                                                {r.ref && r.packaging && ' · '}
                                                {r.packaging}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2 text-right font-black text-frusangar-dark text-sm align-top">
                                            {r.bultos ? fmt(r.bultos, 1) : '-'}
                                            {compact && r.bultos > 0 && (
                                                <div className={`text-[10px] font-bold ${r.pendingBultos ? 'text-frusangar-orange' : 'text-emerald-600'}`}>
                                                    {r.pendingBultos ? `${fmt(r.pendingBultos, 1)} por prep.` : '✔'}
                                                </div>
                                            )}
                                        </td>
                                        {!compact && (
                                            <td className={`py-2.5 px-2 text-right font-bold ${r.pendingBultos ? 'text-frusangar-orange' : 'text-emerald-600'}`}>
                                                {r.bultos ? (r.pendingBultos ? fmt(r.pendingBultos, 1) : '✔') : '-'}
                                            </td>
                                        )}
                                        {!compact && <td className="py-2.5 px-2 text-right text-stone-600 whitespace-nowrap">{fmt(r.qty, 2)} {r.uom}</td>}
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap" title={r.kgMissing ? 'Algún producto no tiene el peso puesto en Odoo' : undefined}>
                                            <div className="font-bold text-stone-800">{kgCell(r.kg, r.kgMissing)}</div>
                                            {compact && <div className="text-[10px] text-stone-400">{fmt(r.qty, 2)} {r.uom}</div>}
                                            {!compact && r.pendingKg > 0 && r.pendingKg !== r.kg && (
                                                <div className="text-[10px] font-bold text-frusangar-orange">({fmt(r.pendingKg)} por prep.)</div>
                                            )}
                                        </td>
                                        {showStock && (
                                            <td className="py-2.5 px-2 text-right whitespace-nowrap align-top"><MissingCell r={r} /></td>
                                        )}
                                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold ${r.split.length > 1 ? 'bg-sky-50 text-sky-700' : 'text-stone-500'}`}>
                                                {r.split.length}
                                                <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                                            </span>
                                        </td>
                                    </tr>
                                    {open && (
                                        <tr className="bg-frusangar-light/30">
                                            <td colSpan={colCount} className="px-4 pb-3 pt-1">
                                                <SplitList row={r} compact />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-stone-200 bg-stone-50 font-black text-stone-800">
                            <td className="py-2.5 px-4 uppercase text-[11px] tracking-wide">Total</td>
                            <td className="py-2.5 px-2 text-right text-sm text-frusangar-dark">
                                {fmt(total.bultos, 1)}
                                {compact && (
                                    <div className={`text-[10px] ${total.pendingBultos ? 'text-frusangar-orange' : 'text-emerald-600'}`}>
                                        {total.pendingBultos ? `${fmt(total.pendingBultos, 1)} por prep.` : '✔'}
                                    </div>
                                )}
                            </td>
                            {!compact && <td className={`py-2.5 px-2 text-right ${total.pendingBultos ? 'text-frusangar-orange' : 'text-emerald-600'}`}>{total.pendingBultos ? fmt(total.pendingBultos, 1) : '✔'}</td>}
                            {!compact && <td className="py-2.5 px-2"></td>}
                            <td className="py-2.5 px-2 text-right whitespace-nowrap">
                                <div className="text-sm">{kgCell(total.kg, total.kgMissing)}</div>
                                {total.pendingKg > 0 && total.pendingKg !== total.kg && (
                                    <div className="text-[10px] text-frusangar-orange">({fmt(total.pendingKg)} por prep.)</div>
                                )}
                            </td>
                            {showStock && (
                                <td className={`py-2.5 px-2 text-right whitespace-nowrap ${totalMissingBultos ? 'text-red-600' : 'text-emerald-600'}`}
                                    title="Bultos que faltan por fabricar (productos con empaquetado)">
                                    {totalMissingBultos ? `${fmt(totalMissingBultos)} b.` : '✔'}
                                </td>
                            )}
                            <td className="py-2.5 px-4"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {hoverRow && (
                <div
                    className="fixed z-40 bg-white rounded-xl shadow-float border border-stone-200 p-3 overflow-y-auto overflow-x-hidden pointer-events-none"
                    style={{ width: CARD_WIDTH, ...hover.pos }}
                >
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                            <div className="font-black text-stone-800 text-sm truncate">{hoverRow.name}</div>
                            <div className="text-[11px] text-stone-500 truncate">{hoverRow.packaging}</div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[9px] uppercase font-bold text-stone-400">En {hoverRow.split.length} {hoverRow.split.length === 1 ? 'pedido' : 'pedidos'}</div>
                            <div className="font-black text-frusangar-dark">{hoverRow.bultos ? `${fmt(hoverRow.bultos, 1)} bultos` : `${fmt(hoverRow.qty, 2)} ${hoverRow.uom}`}</div>
                        </div>
                    </div>
                    <SplitList row={hoverRow} />
                    {showStock && hoverRow.pendingQty > 0 && (
                        <div className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] font-bold ${hoverRow.missing > 1e-6 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            Almacén 4: {fmt(hoverRow.available, 2)} {hoverRow.uom} disponibles para este día ·{' '}
                            {hoverRow.missing > 1e-6
                                ? `faltan ${fmt(hoverRow.missing, 2)} ${hoverRow.uom}${missingBultos(hoverRow) != null ? ` (${fmt(Math.ceil(missingBultos(hoverRow) - 1e-6))} bultos)` : ''}`
                                : 'cubierto'}
                        </div>
                    )}
                    <div className="mt-2 text-[10px] text-stone-400">⏳ albarán pendiente · ✔ albarán hecho · Pulsa la fila para dejarlo abierto</div>
                </div>
            )}
        </div>
    );
};

export default ProductSummary;
