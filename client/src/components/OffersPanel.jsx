import React from 'react';
import { X, Tag, AlertTriangle } from 'lucide-react';
import { OFFER_STATUS, offerWindowText, offerDeliveryText, offerValidityText, dayMonthOf } from '../priority';

const GROUPS = ['vigente', 'proxima', 'terminada'];

const fmtN = (n) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 });
// «Bolsa» → «bolsas»
const unit = (m) => {
    const u = (m.uom || 'uds').toLowerCase();
    return /s$/.test(u) || u === 'kg' ? u : `${u}s`;
};

// Material semaphore (ESTIMATION, server/offerMaterials.js): does what is in stock last until the offer ends?
const MATERIAL_STYLE = {
    falta: 'bg-red-50 border-red-200 text-red-800',
    justo: 'bg-amber-50 border-amber-200 text-amber-800',
    cubierto: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    sin_datos: 'bg-stone-50 border-stone-200 text-stone-600',
};

// Pricelist offers (Odoo): who, which product and when it is served. Never prices.
const OffersPanel = ({ open, offers, fetchedAt, onClose }) => {
    if (!open) return null;
    const list = offers || [];

    return (
        <div className="fixed inset-0 z-[65] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-float w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-3">
                    <Tag className="text-fuchsia-600 shrink-0" size={22} />
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-frusangar-dark">Ofertas</h2>
                        <p className="text-xs text-stone-500">
                            De las tarifas de Odoo · qué cliente, qué producto y cuándo se sirve
                            {fetchedAt && ` · leídas a las ${new Date(fetchedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                    </div>
                    <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-stone-400 hover:bg-stone-100" title="Cerrar"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {!offers && <p className="text-sm text-stone-400 text-center py-10">Leyendo las ofertas de Odoo…</p>}
                    {offers && list.length === 0 && <p className="text-sm text-stone-400 text-center py-10">No hay ofertas en vigor ni próximas.</p>}
                    {GROUPS.map(status => {
                        const items = list.filter(o => o.status === status);
                        if (!items.length) return null;
                        const s = OFFER_STATUS[status];
                        return (
                            <section key={status}>
                                <h3 className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-stone-600">
                                    <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>{s.label}
                                    <span className="text-xs font-bold text-stone-400">{items.length}</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {items.map(o => (
                                        <div key={o.id} className={`rounded-xl border p-3.5 shadow-card ${s.card}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-base font-display font-bold text-frusangar-text leading-snug">
                                                        {o.customers?.length ? o.customers.join(' · ') : o.pricelist}
                                                    </div>
                                                    {o.customers?.length > 0 && o.pricelist && (
                                                        <div className="text-[11px] text-stone-400">Tarifa {o.pricelist}</div>
                                                    )}
                                                </div>
                                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${s.chip}`}>{s.short}</span>
                                            </div>
                                            <div className="mt-2 text-sm font-bold text-stone-800">🏷 {o.product}</div>
                                            {o.byOrder !== false ? (
                                                <>
                                                    <div className="mt-1 text-xs font-bold text-fuchsia-800"
                                                        title="Fechas de PEDIDO: es con la fecha de pedido con la que Odoo pone el precio de oferta y factura">
                                                        📅 Pedidos {offerValidityText(o)}
                                                    </div>
                                                    {o.validityEnd && (
                                                        <div className="text-[10px] font-semibold text-amber-700">
                                                            ⚠ Odoo corta el {dayMonthOf(o.validityEnd)} a las 00:00: último día de pedido el {dayMonthOf(o.end)}
                                                        </div>
                                                    )}
                                                    {(o.deliveryStart || o.deliveryEnd) && (
                                                        <div className="text-[11px] font-semibold text-stone-500">🚚 Se sirve {offerDeliveryText(o)}</div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="mt-1 text-xs font-semibold text-stone-600"
                                                    title="La regla no tiene fechas de pedido en Odoo: solo ventana de entrega">
                                                    🚚 Se sirve {offerWindowText(o)} · <span className="text-red-700">sin fechas de pedido en Odoo</span>
                                                </div>
                                            )}
                                            {o.comment && <div className="mt-1 text-xs italic text-stone-500">{o.comment}</div>}
                                            {o.material && (
                                                <div className="mt-2 text-xs text-stone-700">
                                                    {o.material.method === 'sin datos' ? (
                                                        <span>📊 Venta estimada: <b>sin datos</b> · ya pedidas {fmtN(o.material.ordered)} {unit(o.material)}</span>
                                                    ) : (
                                                        <span>
                                                            📊 Venta estimada: <b>≈ {fmtN(o.material.estimate)} {unit(o.material)}</b>
                                                            {' · '}ya pedidas {fmtN(o.material.ordered)}
                                                            {(o.material.bultos != null || o.material.kg != null) && (
                                                                <span className="mt-1 flex flex-wrap gap-1.5">
                                                                    {o.material.bultos != null && (
                                                                        <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 font-bold"
                                                                            title={`Bultos según ${o.material.bultosFrom}`}>
                                                                            ≈ {fmtN(o.material.bultos)} bultos
                                                                        </span>
                                                                    )}
                                                                    {o.material.kg != null && (
                                                                        <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 font-bold"
                                                                            title="Kilos según el «Peso» del producto en Odoo">
                                                                            ≈ {fmtN(o.material.kg)} kg
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                    <span className="block text-[10px] italic text-stone-500">
                                                        Estimación: {o.material.method === 'historial de ofertas' ? 'por sus ofertas anteriores' : o.material.method}
                                                    </span>
                                                </div>
                                            )}
                                            {o.material && (
                                                <div
                                                    className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${MATERIAL_STYLE[o.material.level] || MATERIAL_STYLE.sin_datos}`}
                                                    title={`Estimación de venta: ≈${o.material.estimate} (${o.material.method}). El detalle y qué pedir, en el panel de envases de la oficina.`}
                                                >
                                                    <span className="block text-[9px] font-black uppercase tracking-wide opacity-70">📦 Material · estimación</span>
                                                    {o.material.text}
                                                </div>
                                            )}
                                            {(o.issue || o.unclassified) && (
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {o.issue && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold">
                                                            <AlertTriangle size={11} /> {o.issue}
                                                        </span>
                                                    )}
                                                    {o.unclassified && (
                                                        <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-500 text-[10px] font-bold"
                                                            title="En Odoo la regla tiene fechas pero «Tipo de precio» no está puesto como Oferta">
                                                            Sin marcar como oferta en Odoo
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default OffersPanel;
