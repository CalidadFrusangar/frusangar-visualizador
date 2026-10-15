import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { PRIORITY_STYLE, clockTime } from '../priority';
import OdooLink from './OdooLink';

const FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'important', label: 'Importantes' },
];

// Critical and important alerts can be marked as seen by a Navalcarnero employee
const needsAck = (e) => e.priority === 'critico' || e.priority === 'alto';

const ChangesPanel = ({ events, onSelectOrder, onAck, className = '' }) => {
    const [filter, setFilter] = useState('all');
    const visible = filter === 'all' ? events : events.filter(e => e.priority === 'critico' || e.priority === 'alto');

    return (
        <aside className={`flex-col bg-white rounded-xl shadow-card border border-stone-100/80 overflow-hidden ${className}`}>
            <div className="px-4 py-3 border-b border-stone-100">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-frusangar-dark flex items-center gap-2">
                        <Bell size={18} className="text-frusangar-orange" /> Avisos
                    </h2>
                    <div className="flex bg-stone-100 rounded-full p-0.5 text-[11px] font-bold">
                        {FILTERS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key)}
                                className={`px-2.5 py-1 rounded-full transition-colors ${filter === f.key ? 'bg-white shadow text-stone-800' : 'text-stone-500'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar max-h-[60vh] xl:max-h-none">
                {visible.length === 0 && (
                    <p className="text-sm text-stone-400 text-center py-10">Sin cambios recientes en los pedidos.</p>
                )}
                {visible.map(e => {
                    const style = PRIORITY_STYLE[e.priority];
                    return (
                        <div
                            key={e.id}
                            role="button"
                            tabIndex={0}
                            title="Ver el pedido en el visualizador"
                            onClick={() => onSelectOrder(e.orderId, e.orderName)}
                            onKeyDown={(ev) => ev.key === 'Enter' && onSelectOrder(e.orderId, e.orderName)}
                            className={`w-full text-left rounded-lg border p-2.5 cursor-pointer transition-transform active:scale-[0.98] hover:shadow-md ${style.soft}`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${style.chip}`}>
                                    {e.test && 'Prueba · '}{style.label}
                                </span>
                                <span className="text-[11px] font-semibold opacity-70">{clockTime(e.ts)}</span>
                            </div>
                            <div className="text-sm font-black leading-tight">
                                {e.orderName} · {e.dayLabel}
                            </div>
                            <div className="text-xs font-semibold opacity-80 truncate">{e.partner}</div>
                            {e.wasValidated && e.priority !== 'info' && (
                                <div className="text-[10px] font-black uppercase mt-1">⚠ Albarán ya validado</div>
                            )}
                            <ul className="mt-1.5 text-xs space-y-0.5">
                                {e.changes.slice(0, 5).map((c, i) => <li key={i}>{c.text}</li>)}
                                {e.changes.length > 5 && <li className="opacity-70">… y {e.changes.length - 5} cambios más</li>}
                            </ul>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                {needsAck(e) && (e.ack ? (
                                    <span className="text-[11px] font-bold text-emerald-700">
                                        ✔ Visto por {e.ack.name} · {clockTime(e.ack.at)}
                                    </span>
                                ) : (
                                    <button
                                        onClick={(ev) => { ev.stopPropagation(); onAck(e); }}
                                        className="px-2.5 py-1 rounded-md bg-stone-800 text-white text-[11px] font-bold active:scale-95"
                                    >
                                        ✔ Marcar visto
                                    </button>
                                ))}
                                <span className="ml-auto flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold opacity-70">Ver pedido →</span>
                                    {!e.test && <OdooLink orderId={e.orderId} />}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
};

export default ChangesPanel;
