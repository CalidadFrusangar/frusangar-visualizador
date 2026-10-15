import React from 'react';
import { X, Play, ListVideo } from 'lucide-react';
import { PRIORITY_STYLE } from '../priority';
import { SCENARIOS, EFFECT } from '../demoAlerts';


const DemoAlerts = ({ open, onClose, onTry, onPlayAll, soundOn, voiceOn }) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-float w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-3">
                    <h2 className="text-lg font-bold text-frusangar-dark">🧪 Probar avisos</h2>
                    <span className="text-xs text-stone-400">Avisos de prueba: no se envían ni se guardan</span>
                    <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-stone-400 hover:bg-stone-100" title="Cerrar"><X size={18} /></button>
                </div>

                {(!soundOn || !voiceOn) && (
                    <div className="mx-5 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                        {!soundOn && 'Los pitidos están apagados (botón 🔊). '}
                        {!voiceOn && 'La voz está apagada (botón 📢). '}
                        Actívalos arriba a la derecha para oírlos.
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 py-3">
                    {SCENARIOS.map((s, i) => {
                        const style = PRIORITY_STYLE[s.priority];
                        const header = i === 0 || SCENARIOS[i - 1].priority !== s.priority;
                        return (
                            <React.Fragment key={i}>
                                {header && (
                                    <div className="mt-3 mb-1.5 flex items-center gap-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${style.chip}`}>{style.label}</span>
                                        <span className="text-[11px] text-stone-500">{EFFECT[s.priority]}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-stone-800">{s.when}</div>
                                        <div className="text-xs text-stone-500 truncate">{s.text}</div>
                                    </div>
                                    <button
                                        onClick={() => onTry(i)}
                                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-frusangar-green hover:bg-frusangar-dark text-white text-xs font-bold active:scale-95"
                                    >
                                        <Play size={13} /> Probar
                                    </button>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className="px-5 py-3 border-t border-stone-100 bg-stone-50 flex items-center gap-3">
                    <span className="text-[11px] text-stone-500">En el móvil, el aviso de prueba se manda desde la campana 🔔.</span>
                    <button
                        onClick={onPlayAll}
                        className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-frusangar-dark text-white text-sm font-bold active:scale-95"
                    >
                        <ListVideo size={16} /> Reproducir todos
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DemoAlerts;
