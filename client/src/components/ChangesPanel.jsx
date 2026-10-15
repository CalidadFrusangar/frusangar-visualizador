import React, { useState } from 'react';
import { Bell, Archive, ArchiveRestore } from 'lucide-react';
import { PRIORITY_STYLE, clockTime } from '../priority';
import OdooLink from './OdooLink';

// Critical and important alerts can be marked as seen by a Navalcarnero employee
const needsAck = (e) => e.priority === 'critico' || e.priority === 'alto';
const isImportant = (e) => e.priority === 'critico' || e.priority === 'alto';
// Critical / important alerts leave the list only once someone says they saw them
const canArchiveDirectly = (e) => !needsAck(e) || !!e.ack;

const ChangesPanel = ({ events, onSelectOrder, onAck, onArchive, className = '' }) => {
    const [filter, setFilter] = useState('all');
    const active = events.filter(e => !e.archivedAt);
    const archived = events.filter(e => e.archivedAt);
    const visible = filter === 'archived' ? archived : filter === 'important' ? active.filter(isImportant) : active;
    const bulk = filter === 'archived' ? [] : visible.filter(canArchiveDirectly);

    const filters = [
        { key: 'all', label: 'Todos' },
        { key: 'important', label: 'Importantes' },
        { key: 'archived', label: `Archivados${archived.length ? ` (${archived.length})` : ''}` },
    ];

    const archiveOne = (ev, e) => {
        ev.stopPropagation();
        if (canArchiveDirectly(e)) onArchive([e]);
        else onAck(e); // ask who saw it; seen alerts are archived
    };

    return (
        <aside className={`flex-col bg-white rounded-xl shadow-card border border-stone-100/80 overflow-hidden ${className}`}>
            <div className="px-4 py-3 border-b border-stone-100">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-frusangar-dark flex items-center gap-2">
                        <Bell size={18} className="text-frusangar-orange" /> Avisos
                    </h2>
                    {bulk.length > 1 && (
                        <button
                            onClick={() => onArchive(bulk)}
                            title="Los críticos e importantes sin marcar como vistos se quedan"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-stone-200 text-[11px] font-bold text-stone-500 hover:bg-stone-50 hover:text-stone-800 whitespace-nowrap"
                        >
                            <Archive size={13} /> Archivar {bulk.length}
                        </button>
                    )}
                </div>
                <div className="mt-2 flex bg-stone-100 rounded-full p-0.5 text-[11px] font-bold">
                    {filters.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`flex-1 px-2 py-1 rounded-full transition-colors whitespace-nowrap ${filter === f.key ? 'bg-white shadow text-stone-800' : 'text-stone-500'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar max-h-[60vh] xl:max-h-none">
                {visible.length === 0 && (
                    <p className="text-sm text-stone-400 text-center py-10">
                        {filter === 'archived' ? 'No hay avisos archivados.' : 'Sin avisos pendientes.'}
                    </p>
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
                            className={`w-full text-left rounded-lg border p-2.5 cursor-pointer transition-transform active:scale-[0.98] hover:shadow-md ${style.soft} ${e.archivedAt ? 'opacity-70' : ''}`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${style.chip}`}>
                                    {e.test && 'Prueba · '}{style.label}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-semibold opacity-70">{clockTime(e.ts)}</span>
                                    {e.archivedAt ? (
                                        <button
                                            onClick={(ev) => { ev.stopPropagation(); onArchive([e], false); }}
                                            title="Volver a poner en avisos"
                                            className="p-1 rounded-md hover:bg-black/10 opacity-70 hover:opacity-100"
                                        >
                                            <ArchiveRestore size={14} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={(ev) => archiveOne(ev, e)}
                                            title={canArchiveDirectly(e) ? 'Archivar' : 'Marcar visto y archivar'}
                                            className="p-1 rounded-md hover:bg-black/10 opacity-60 hover:opacity-100"
                                        >
                                            <Archive size={14} />
                                        </button>
                                    )}
                                </span>
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
