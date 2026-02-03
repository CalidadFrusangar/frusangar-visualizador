import React from 'react';
import { X, Layers, Box, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const OrderModal = ({ order, onClose }) => {
    if (!order) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-900/60 backdrop-blur-sm" onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/20"
                >
                    {/* Header - Premium Dark Green */}
                    <div className="bg-frusangar-dark relative overflow-hidden flex-shrink-0">
                        {/* Decorative Background Pattern */}
                        <div className="absolute top-0 right-0 -mr-16 -mt-16 text-white opacity-[0.03] pointer-events-none">
                            <Layers size={300} strokeWidth={0.5} />
                        </div>

                        <div className="p-6 sm:p-8 flex justify-between items-start relative z-10 text-white">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="bg-white/10 backdrop-blur text-frusangar-accent px-2.5 py-0.5 rounded text-xs font-mono tracking-wider border border-white/10 shadow-sm">
                                        {order.name}
                                    </span>
                                    <span className="text-frusangar-light/80 text-sm font-medium tracking-wide">
                                        {order.commitment_date}
                                    </span>
                                </div>
                                <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-white drop-shadow-sm">
                                    {order.partner_id ? order.partner_id[1] : 'Cliente Desconocido'}
                                </h2>
                            </div>

                            <button
                                onClick={onClose}
                                className="group bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all duration-200 backdrop-blur-sm border border-white/5 active:scale-90"
                            >
                                <X size={24} className="text-white group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                        </div>
                    </div>

                    {/* Content - Scrollable Table */}
                    <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-stone-50/90 sticky top-0 shadow-sm z-20 backdrop-blur-sm">
                                <tr className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                                    <th className="py-4 px-6 sm:pl-8 w-[30%]">Producto / Referencia</th>
                                    <th className="py-4 px-2 text-right w-[10%]">Bultos</th>
                                    <th className="py-4 px-4 w-[20%]">Empaquetado</th>
                                    <th className="py-4 px-2 text-right w-[10%]">Palets</th>
                                    <th className="py-4 px-4 w-[15%]">Formato</th>
                                    <th className="py-4 px-6 sm:pr-8 text-right w-[15%]">Cantidad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100/60 text-sm">
                                {order.lines.map((line) => {
                                    // Handle Sections
                                    if (line.display_type === 'line_section') {
                                        return (
                                            <tr key={line.id} className="bg-stone-50 border-y border-stone-200/50">
                                                <td colSpan="6" className="py-3 px-6 sm:pl-8 font-bold text-frusangar-dark uppercase tracking-wide text-xs">
                                                    {line.name}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    // Handle Notes (or missing product_id)
                                    const isNote = line.display_type === 'line_note' || !line.product_id || (Array.isArray(line.product_id) && line.product_id.length === 0);

                                    if (isNote) {
                                        return (
                                            <tr key={line.id} className="bg-amber-50/50">
                                                <td colSpan="6" className="py-3 px-6 sm:pl-8 text-amber-700/80 italic text-sm border-b border-amber-100/30">
                                                    {line.name}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    // Regular Product Lines
                                    return (
                                        <tr key={line.id} className="hover:bg-frusangar-light/20 transition-colors group">

                                            {/* Product Name & Ref */}
                                            <td className="py-3.5 px-6 sm:pl-8 align-top">
                                                <div className="font-bold text-frusangar-text group-hover:text-frusangar-dark transition-colors">
                                                    {line.product_id && line.product_id[1] ? line.product_id[1].replace(/\[.*?\]\s*/, '') : 'Producto Desconocido'}
                                                </div>
                                                <div className="text-xs text-stone-400 font-mono mt-0.5">
                                                    {line.product_id && line.product_id[1] && line.product_id[1].includes('[') ? line.product_id[1].split(']')[0].replace('[', '') : '-'}
                                                </div>
                                            </td>

                                            {/* Bultos (product_packaging_qty) */}
                                            <td className="py-3.5 px-2 text-right">
                                                <span className="font-black text-frusangar-dark text-base">
                                                    {line.product_packaging_qty
                                                        ? line.product_packaging_qty.toLocaleString('es-ES', { maximumFractionDigits: 1 })
                                                        : '-'
                                                    }
                                                </span>
                                            </td>

                                            {/* Empaquetado (product_packaging_id) */}
                                            <td className="py-3.5 px-4 text-xs font-medium text-stone-600">
                                                {line.product_packaging_id ? line.product_packaging_id[1] : ''}
                                            </td>

                                            {/* Nº Palets (palet_qty) */}
                                            <td className="py-3.5 px-2 text-right font-mono text-stone-500 text-xs">
                                                {line.palet_qty
                                                    ? line.palet_qty.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 5 })
                                                    : '-'
                                                }
                                            </td>

                                            {/* Fmto palet (palet_id) */}
                                            <td className="py-3.5 px-4 text-stone-400 text-xs uppercase">
                                                {line.palet_id ? line.palet_id[1] : ''}
                                            </td>

                                            {/* Cantidad (product_uom_qty) */}
                                            <td className="py-3.5 px-6 sm:pr-8 text-right">
                                                <span className="font-bold text-base text-stone-800">
                                                    {line.product_uom_qty ? line.product_uom_qty.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer - Elegant Summary */}
                    <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex justify-between items-center text-xs text-stone-400 font-medium">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-frusangar-green"></div>
                            Frusangar S.L. Visualizador
                        </div>
                        <div className="flex gap-6">
                            <span>Total Líneas: {order.lines.length}</span>
                            <span>Ref: {order.name}</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default OrderModal;
