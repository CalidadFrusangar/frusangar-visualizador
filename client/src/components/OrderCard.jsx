import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Package, Box, AlertTriangle, Loader2 } from 'lucide-react';
import { PRIORITY_STYLE, PICKING_STYLE, maxPriority, timeAgo } from '../priority';

const isProductLine = (l) => !l.display_type && Array.isArray(l.product_id) && l.product_id.length > 0;

const fmt = (n, digits = 2) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: digits });
const amount = (v, useBultos) => (v ? (useBultos ? `${fmt(v.bultos, 1)} bultos` : `${fmt(v.qty)} ${v.uom || ''}`) : '');
const beforeAfter = ({ before, after }) => {
    const useBultos = !!(before.bultos && after.bultos && before.bultos !== after.bultos);
    return `${amount(before, useBultos)} → ${amount(after, useBultos)}`;
};

// Latest change per current line, plus lines removed recently
function lineChanges(order) {
    const byLine = new Map();
    const removed = [];
    const currentProducts = new Set(order.lines.filter(isProductLine).map(l => l.product_id[0]));
    for (const event of order.recentEvents || []) {
        for (const c of event.changes) {
            if (c.lineId && !byLine.has(c.lineId)) byLine.set(c.lineId, c);
            if (c.type === 'LINEA_ELIMINADA' && !currentProducts.has(c.productId) && !removed.some(r => r.productId === c.productId)) {
                removed.push(c);
            }
        }
    }
    return { byLine, removed };
}

const LINE_ROW_STYLE = {
    LINEA_AÑADIDA: 'bg-emerald-50',
    AUMENTO: 'bg-emerald-50',
    DISMINUCION: 'bg-orange-50',
};

const OrderCard = ({ order, dimmed = false, focused = false }) => {
    const [userToggled, setUserToggled] = useState(null);
    const expanded = userToggled ?? focused;
    const ref = useRef(null);

    useEffect(() => {
        if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [focused]);

    const productLines = order.lines?.filter(isProductLine) || [];
    const totalBultos = productLines.reduce((sum, l) => sum + (l.product_packaging_qty || 0), 0);
    const totalUnits = productLines.reduce((sum, l) => sum + (l.product_uom_qty || 0), 0);

    const orderRef = order.name?.split(' ')[0] || order.name;
    const customerName = order.partner_id ? order.partner_id[1] : 'Cliente desconocido';
    const cancelled = order.state === 'cancel';

    const relevantEvents = (order.recentEvents || []).filter(e => e.priority !== 'info');
    const changePriority = relevantEvents.length ? maxPriority(relevantEvents) : null;
    const changeStyle = changePriority ? PRIORITY_STYLE[changePriority] : null;
    const picking = PICKING_STYLE[order.pickingStatus] || PICKING_STYLE.pendiente;
    const { byLine, removed } = lineChanges(order);

    const deliveryTime = new Date(order.deliveryDate).toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`group bg-white rounded-xl shadow-card hover:shadow-card-hover border border-stone-100/80 transition-all duration-300 overflow-hidden mb-4
                ${changeStyle ? `ring-2 ${changeStyle.ring}` : expanded ? 'ring-2 ring-frusangar-green/20' : ''}
                ${focused ? 'ring-4 ring-frusangar-green' : ''}
                ${dimmed || cancelled ? 'opacity-60 hover:opacity-100' : ''}`}
        >
            {/* Change banner */}
            {changeStyle && !cancelled && (
                <div className={`px-5 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide ${changeStyle.chip} ${changePriority === 'critico' ? 'animate-pulse' : ''}`}>
                    <span className="flex items-center gap-1.5">
                        <AlertTriangle size={13} />
                        Modificado · {changeStyle.label}
                        {relevantEvents[0]?.wasValidated && ' · tras validar albarán'}
                    </span>
                    <span className="font-semibold normal-case opacity-90">{timeAgo(relevantEvents[0].ts)}</span>
                </div>
            )}
            {cancelled && (
                <div className="px-5 py-1.5 text-[11px] font-black uppercase tracking-widest bg-red-600 text-white">
                    ✖ Pedido cancelado · no preparar
                </div>
            )}

            {/* Collapsed view */}
            <div onClick={() => setUserToggled(!expanded)} className="cursor-pointer relative">
                <div className="p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">

                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-frusangar-light text-frusangar-dark tracking-wide uppercase border border-frusangar-green/10">
                                {orderRef}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${picking.className}`}>
                                <span>{picking.icon}</span>{picking.label}
                            </span>
                            {order.changePending && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700" title="Se está modificando en Odoo">
                                    <Loader2 size={11} className="animate-spin" /> editándose
                                </span>
                            )}
                            <span className="text-xs text-stone-400 font-medium">{deliveryTime}</span>
                        </div>

                        <h3 className={`text-lg font-display font-bold text-frusangar-text truncate pr-4 group-hover:text-frusangar-green transition-colors ${cancelled ? 'line-through' : ''}`}>
                            {customerName}
                        </h3>

                        <div className="flex items-center gap-4 mt-3 text-xs text-frusangar-muted">
                            <div className="flex items-center gap-1.5" title="Total Líneas">
                                <span className="bg-stone-100 p-1 rounded-md text-stone-500"><Box size={14} /></span>
                                <span className="font-medium">{productLines.length} Lín.</span>
                            </div>
                            <div className="flex items-center gap-1.5" title="Total Unidades">
                                <span className="bg-stone-100 p-1 rounded-md text-stone-500"><Package size={14} /></span>
                                <span className="font-medium">{Math.round(totalUnits).toLocaleString('es-ES')} Uds.</span>
                            </div>
                        </div>

                        {/* Latest change summary, visible without expanding */}
                        {changeStyle && !cancelled && (
                            <ul className={`mt-3 text-xs rounded-lg border px-3 py-2 space-y-0.5 ${changeStyle.soft}`}>
                                {relevantEvents[0].changes.filter(c => c.priority !== 'info').slice(0, 4).map((c, i) => (
                                    <li key={i} className="font-semibold">{c.text}</li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Right: Bultos Big Metric */}
                    <div className="flex items-center gap-5 sm:border-l sm:border-stone-100 sm:pl-5">
                        <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-frusangar-muted tracking-wider mb-0.5">Bultos</div>
                            <div className="flex items-baseline justify-end gap-1">
                                <span className="text-2xl font-display font-black text-frusangar-dark">
                                    {Math.round(totalBultos).toLocaleString('es-ES')}
                                </span>
                                <span className="text-frusangar-green text-xs font-semibold">
                                    <Package size={12} className="inline ml-0.5" />
                                </span>
                            </div>
                        </div>

                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${expanded ? 'bg-frusangar-green text-white rotate-180' : 'bg-stone-50 text-stone-400 group-hover:bg-frusangar-light group-hover:text-frusangar-green'}`}>
                            <ChevronDown size={18} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded view */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-stone-100 bg-stone-50/30">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead>
                                        <tr className="border-b border-stone-200/60 text-stone-400 font-semibold uppercase tracking-wider text-[10px]">
                                            <th className="py-3 px-5 pl-6 w-[30%]">Producto / Referencia</th>
                                            <th className="py-3 px-2 text-right w-[12%]">Bultos</th>
                                            <th className="py-3 px-4 w-[20%]">Empaquetado</th>
                                            <th className="py-3 px-2 text-right w-[10%]">Palets</th>
                                            <th className="py-3 px-4 w-[15%]">Formato</th>
                                            <th className="py-3 px-5 pr-6 text-right w-[13%]">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-100 bg-white">
                                        {order.lines && order.lines.map((line) => {
                                            if (line.display_type === 'line_section') {
                                                return (
                                                    <tr key={line.id} className="bg-stone-100 border-y border-stone-200">
                                                        <td colSpan="6" className="py-3 px-6 font-black text-stone-800 uppercase tracking-wide text-xs">
                                                            {line.name}
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            if (!isProductLine(line)) {
                                                return (
                                                    <tr key={line.id} className="bg-amber-50/40">
                                                        <td colSpan="6" className="py-2.5 px-6 text-stone-500 italic text-[11px]">
                                                            {line.name}
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            const productName = line.product_id[1];
                                            const refMatch = productName.match(/\[([^\]]+)\]/);
                                            const productRef = refMatch ? refMatch[1] : '-';

                                            const packagingName = (Array.isArray(line.product_packaging_id) && line.product_packaging_id.length > 0)
                                                ? line.product_packaging_id[1]
                                                : (Array.isArray(line.product_uom) ? line.product_uom[1] : '-');

                                            const palletFormat = (Array.isArray(line.palet_id) && line.palet_id.length > 0) ? line.palet_id[1] : '-';
                                            const change = byLine.get(line.id);

                                            return (
                                                <tr key={line.id} className={`hover:bg-frusangar-light/20 transition-colors group/row ${change ? LINE_ROW_STYLE[change.type] || '' : ''}`}>
                                                    <td className="py-3 px-5 pl-6 align-top">
                                                        <div className="font-bold text-stone-800 text-xs mb-1 group-hover/row:text-frusangar-dark transition-colors tracking-tight">
                                                            {productName.split('] ')[1] || productName}
                                                            {change?.type === 'LINEA_AÑADIDA' && <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase">Nuevo</span>}
                                                        </div>
                                                        <div className="text-[11px] text-stone-500 font-mono font-medium">
                                                            Ref: {productRef}
                                                        </div>
                                                        {change && change.before && (
                                                            <div className={`mt-1 text-[11px] font-bold ${change.type === 'AUMENTO' ? 'text-emerald-700' : 'text-orange-700'}`}>
                                                                Antes: {beforeAfter(change)}
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td className="py-3 px-2 text-right font-bold text-frusangar-dark">
                                                        {line.product_packaging_qty ? fmt(line.product_packaging_qty, 1) : '-'}
                                                    </td>

                                                    <td className="py-3 px-4 text-xs font-medium text-stone-600">
                                                        {packagingName}
                                                    </td>

                                                    <td className="py-3 px-2 text-right text-stone-500 font-mono text-[10px]">
                                                        {line.palet_qty > 0 ? Number(line.palet_qty).toFixed(2).replace('.', ',') : '-'}
                                                    </td>

                                                    <td className="py-3 px-4 text-[10px] text-stone-400 uppercase">
                                                        {palletFormat}
                                                    </td>

                                                    <td className="py-3 px-5 pr-6 text-right font-black text-stone-900 text-sm">
                                                        {line.product_uom_qty ? fmt(line.product_uom_qty) : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}

                                        {/* Lines removed recently */}
                                        {removed.map((c) => (
                                            <tr key={`removed-${c.productId}`} className="bg-red-50">
                                                <td className="py-3 px-5 pl-6 align-top text-red-700">
                                                    <div className="font-bold text-xs line-through">{c.product}</div>
                                                    <div className="text-[10px] font-black uppercase">Eliminado</div>
                                                </td>
                                                <td className="py-3 px-2 text-right font-bold text-red-700 line-through">
                                                    {c.before?.bultos ? fmt(c.before.bultos, 1) : '-'}
                                                </td>
                                                <td colSpan="3"></td>
                                                <td className="py-3 px-5 pr-6 text-right font-black text-red-700 line-through">
                                                    {fmt(c.before?.qty)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer inside expanded */}
                            <div className="px-6 py-3 bg-stone-50 border-t border-stone-200/60 flex justify-between items-center text-[10px] text-frusangar-muted">
                                <span>
                                    {order.pickings?.length
                                        ? order.pickings.map(p => `${p.name} (${p.state === 'done' ? 'hecho' : 'pendiente'})`).join(' · ')
                                        : 'Sin albarán'}
                                </span>
                                <button className="text-frusangar-green font-bold hover:underline" onClick={(e) => { e.stopPropagation(); setUserToggled(false); }}>
                                    Cerrar Detalle
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default OrderCard;
