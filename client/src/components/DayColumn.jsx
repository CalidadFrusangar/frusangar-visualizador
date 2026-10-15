import React, { useState } from 'react';
import { Calendar, CheckCircle2 } from 'lucide-react';
import OrderCard from './OrderCard';
import ProductSummary from './ProductSummary';

const STATUS_ORDER = { pendiente: 0, parcial: 1, validado: 2 };

// Pending first, delivery notes done after, cancelled last
const sortOrders = (orders) => [...orders].sort((a, b) => {
    const ca = a.state === 'cancel' ? 1 : 0;
    const cb = b.state === 'cancel' ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const sa = STATUS_ORDER[a.pickingStatus] ?? 0;
    const sb = STATUS_ORDER[b.pickingStatus] ?? 0;
    if (sa !== sb) return sa - sb;
    return a.deliveryDate.localeCompare(b.deliveryDate);
});

const SECTIONS = [
    { typeId: 1, title: 'Navalcarnero', colorClass: 'text-emerald-700' },
    { typeId: 5, title: 'Mercamadrid Interno', colorClass: 'text-blue-700' },
];

const isProductLine = (l) => !l.display_type && Array.isArray(l.product_id) && l.product_id.length > 0;
const sumLines = (orders, field) => orders.reduce((sum, o) => sum + (o.lines || []).filter(isProductLine).reduce((s, l) => s + (l[field] || 0), 0), 0);
const fmt = (n, digits = 0) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: digits });

const VIEWS = [{ key: 'orders', label: 'Pedidos' }, { key: 'products', label: 'Productos' }];

const formatDate = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

const DayColumn = ({ title, date, orders, accent, loading, focusOrderId, wide = false, className = '' }) => {
    const active = orders.filter(o => o.state !== 'cancel');
    const done = active.filter(o => o.pickingStatus === 'validado').length;
    const progress = active.length ? Math.round((done / active.length) * 100) : 0;
    const withBoxes = active.filter(o => ['declarada', 'sin_declarar'].includes(o.boxes?.status));
    const undeclared = withBoxes.filter(o => o.boxes.status === 'sin_declarar').length;
    const totalBultos = sumLines(active, 'product_packaging_qty');
    const pendingBultos = sumLines(active.filter(o => o.pickingStatus !== 'validado'), 'product_packaging_qty');
    const totalPalets = sumLines(active, 'palet_qty');
    const [view, setView] = useState('orders');

    return (
        <section className={`flex-col min-w-0 ${className}`}>
            <div className={`mb-6 pb-2 border-b-2 ${accent.border}`}>
                <div className="flex items-center">
                    <Calendar className={`mr-2 shrink-0 ${accent.icon}`} size={24} />
                    <h2 className="text-2xl font-bold text-frusangar-dark">{title}</h2>
                    <span className={`ml-auto text-sm font-bold text-frusangar-dark bg-white border px-3 py-1 rounded-full shadow-sm capitalize ${accent.chip}`}>
                        {date ? formatDate(date) : 'Cargando...'}
                    </span>
                </div>
                {active.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs font-medium text-stone-500">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        <span>Albaranes {done}/{active.length}</span>
                        <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${progress}%` }}></div>
                        </div>
                        {withBoxes.length > 0 && (
                            <span
                                title="Albaranes hechos con caja retornable (Euro Pool / IFCO)"
                                className={`shrink-0 px-2 py-0.5 rounded-full font-bold ${undeclared ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}
                            >
                                📦 {undeclared ? `${undeclared} sin declarar` : `${withBoxes.length}/${withBoxes.length} declaradas`}
                            </span>
                        )}
                    </div>
                )}
                {active.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                        <span>Bultos <b className="text-frusangar-dark text-sm">{fmt(totalBultos)}</b></span>
                        <span>Por preparar <b className={`text-sm ${pendingBultos ? 'text-frusangar-orange' : 'text-emerald-600'}`}>{fmt(pendingBultos)}</b></span>
                        {totalPalets > 0 && <span>Palés <b className="text-stone-700 text-sm">{fmt(totalPalets, 1)}</b></span>}
                        <div className="ml-auto flex bg-stone-100 rounded-full p-0.5 text-[11px] font-bold">
                            {VIEWS.map(v => (
                                <button
                                    key={v.key}
                                    onClick={() => setView(v.key)}
                                    className={`px-2.5 py-1 rounded-full transition-colors ${view === v.key ? 'bg-white shadow text-stone-800' : 'text-stone-500'}`}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div>
                {loading && orders.length === 0 ? (
                    <div className="animate-pulse space-y-4">
                        {[1, 2].map(i => <div key={i} className="h-32 bg-white rounded-xl shadow-sm border border-stone-100"></div>)}
                    </div>
                ) : view === 'products' && orders.length > 0 ? (
                    <ProductSummary orders={orders} />
                ) : orders.length === 0 ? (
                    <div className="bg-white/50 p-10 rounded-xl text-center border-dashed border-2 border-stone-200">
                        <p className="text-stone-500 font-medium">No hay pedidos para este día.</p>
                    </div>
                ) : (
                    SECTIONS.map(section => {
                        const list = sortOrders(orders.filter(o => o.type_id?.[0] === section.typeId));
                        if (list.length === 0) return null;
                        return (
                            <div key={section.typeId} className="mb-6">
                                <h4 className={`text-md font-bold mb-3 ${section.colorClass}`}>
                                    {section.title}
                                    <span className="ml-2 text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{list.length}</span>
                                </h4>
                                <div className={wide ? 'grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-x-6 items-start' : ''}>
                                    {list.map(order => (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            dimmed={order.pickingStatus === 'validado'}
                                            focused={order.id === focusOrderId}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
};

export default DayColumn;
