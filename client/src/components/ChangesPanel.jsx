import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { PRIORITY_STYLE, clockTime } from '../priority';

const FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'important', label: 'Importantes' },
];

const ChangesPanel = ({ events, onSelectOrder, className = '' }) => {
    const [filter, setFilter] = useState('all');
    const visible = filter === 'all' ? events : events.filter(e => e.priority === 'critico' || e.priority === 'alto');

    return (
        <aside className={`flex-col bg-white/80 backdrop-blur-sm rounded-3xl border border-white shadow-xl shadow-gray-200/50 lg:h-full overflow-hidden ${className}`}>
            <div className="p-5 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                        <Bell size={20} className="text-frusangar-orange" /> Avisos
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

            <div className="flex-1 lg:overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {visible.length === 0 && (
                    <p className="text-sm text-stone-400 text-center py-10">Sin cambios recientes en los pedidos.</p>
                )}
                {visible.map(e => {
                    const style = PRIORITY_STYLE[e.priority];
                    return (
                        <button
                            key={e.id}
                            onClick={() => onSelectOrder(e.orderId)}
                            className={`w-full text-left rounded-xl border p-3 transition-transform active:scale-[0.98] hover:shadow-md ${style.soft}`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${style.chip}`}>
                                    {style.label}
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
                        </button>
                    );
                })}
            </div>
        </aside>
    );
};

export default ChangesPanel;
