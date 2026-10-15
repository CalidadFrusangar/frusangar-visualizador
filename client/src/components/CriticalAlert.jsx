import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const AUTO_CLOSE_MS = 25_000;

// Full-screen alert for critical changes (for the production-line TV)
const CriticalAlert = ({ event, onClose, onOpen }) => {
    useEffect(() => {
        if (!event) return;
        const t = setTimeout(onClose, AUTO_CLOSE_MS);
        return () => clearTimeout(t);
    }, [event, onClose]);

    return (
        <AnimatePresence>
            {event && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-red-900/70 backdrop-blur-sm flex items-center justify-center p-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-red-600 text-white px-8 py-5 flex items-center gap-4 animate-pulse">
                            <AlertTriangle size={44} />
                            <div>
                                <div className="text-sm font-black uppercase tracking-widest opacity-90">Cambio crítico · {event.dayLabel}</div>
                                <div className="text-3xl md:text-4xl font-black">{event.orderName}</div>
                            </div>
                        </div>
                        <div className="px-8 py-6">
                            <div className="text-2xl font-bold text-stone-800 mb-1">{event.partner}</div>
                            {event.wasValidated && (
                                <div className="text-lg font-black text-red-700 uppercase mb-3">⚠ El albarán ya estaba validado</div>
                            )}
                            <ul className="text-xl md:text-2xl font-semibold text-stone-700 space-y-2 mt-4">
                                {event.changes.filter(c => c.priority !== 'info').map((c, i) => <li key={i}>• {c.text}</li>)}
                            </ul>
                            <div className="flex gap-3 justify-end mt-8">
                                <button onClick={onClose} className="px-5 py-3 rounded-xl bg-stone-100 font-bold text-stone-600">Cerrar</button>
                                <button onClick={() => onOpen(event.orderId)} className="px-5 py-3 rounded-xl bg-red-600 text-white font-bold">Ver pedido</button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CriticalAlert;
