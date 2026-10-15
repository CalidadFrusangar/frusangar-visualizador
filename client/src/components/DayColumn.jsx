import React from 'react';
import { Calendar, CheckCircle2 } from 'lucide-react';
import OrderCard from './OrderCard';

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

const formatDate = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

const DayColumn = ({ title, date, orders, accent, loading, focusOrderId, className = '' }) => {
    const active = orders.filter(o => o.state !== 'cancel');
    const done = active.filter(o => o.pickingStatus === 'validado').length;
    const progress = active.length ? Math.round((done / active.length) * 100) : 0;

    return (
        <section className={`flex-col bg-white/60 backdrop-blur-sm rounded-3xl border border-white shadow-xl shadow-gray-200/50 lg:h-full overflow-hidden relative ${className}`}>
            <div className={`absolute top-0 w-full h-2 ${accent.bar}`}></div>
            <div className="p-5 pb-2 pt-6">
                <div className="flex justify-between items-end border-b border-gray-100 pb-3">
                    <div>
                        <h2 className="text-3xl font-black text-gray-800 tracking-tight">{title}</h2>
                        <p className={`font-bold text-base capitalize flex items-center mt-1 ${accent.text}`}>
                            <Calendar size={16} className="mr-2" />
                            {date ? formatDate(date) : 'Cargando...'}
                        </p>
                    </div>
                    <span className={`font-bold px-3 py-1 rounded-full text-sm ${accent.chip}`}>
                        {active.length} Envíos
                    </span>
                </div>
                {active.length > 0 && (
                    <div className="mt-3">
                        <div className="flex justify-between text-xs font-bold text-stone-500 mb-1">
                            <span className="flex items-center gap-1"><CheckCircle2 size={13} className="text-emerald-600" /> Albaranes hechos</span>
                            <span>{done} de {active.length}</span>
                        </div>
                        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 lg:overflow-y-auto p-5 pt-3 custom-scrollbar pb-10">
                {loading && orders.length === 0 ? (
                    <div className="animate-pulse space-y-4">
                        {[1, 2].map(i => <div key={i} className="h-32 bg-white rounded-xl shadow-sm border border-stone-100"></div>)}
                    </div>
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
                                {list.map(order => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        dimmed={order.pickingStatus === 'validado'}
                                        focused={order.id === focusOrderId}
                                    />
                                ))}
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
};

export default DayColumn;
