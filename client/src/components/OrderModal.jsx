import React from 'react';
import { X, Package, Ruler, Archive, Layers } from 'lucide-react'; // Layers icon for Pallet
import { motion, AnimatePresence } from 'framer-motion';

const OrderModal = ({ order, onClose }) => {
    if (!order) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="bg-frusangar-dark p-6 flex justify-between items-start text-white shadow-md relative overflow-hidden">
                        {/* Decorative faint pattern or icon */}
                        <div className="absolute -right-10 -top-10 text-white opacity-5 pointer-events-none">
                            <Layers size={200} />
                        </div>

                        <div className="z-10">
                            <div className="flex items-center space-x-3 mb-1">
                                <span className="bg-white/20 text-white px-2 py-0.5 rounded text-sm font-mono">{order.name}</span>
                                <span className="text-green-100 text-sm font-medium">{order.commitment_date}</span>
                            </div>
                            <h2 className="text-4xl font-black tracking-tight">{order.partner_id[1]}</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 rounded-full transition-colors z-10"
                        >
                            <X size={36} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-0 overflow-y-auto flex-1 bg-white">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 text-xs uppercase tracking-wider text-gray-500 font-bold">
                                <tr>
                                    <th className="py-4 px-6 w-[25%]">Producto / Referencia</th>
                                    <th className="py-4 px-6 text-right w-[10%]">Bultos</th>
                                    <th className="py-4 px-4 w-[25%]">Empaquetado</th>
                                    <th className="py-4 px-4 text-right w-[10%]">Nº Palets</th>
                                    <th className="py-4 px-4 w-[25%]">Fmto Palet</th>
                                    <th className="py-4 px-6 text-right w-[15%]">Cantidad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {order.lines.map((line, idx) => (
                                    <tr key={line.id} className="hover:bg-frusangar-light/30 transition-colors">

                                        {/* Product Name & Ref */}
                                        <td className="py-3 px-6 align-top">
                                            <div className="font-bold text-gray-800">
                                                {line.product_id[1].replace(/\[.*?\]\s*/, '')}
                                            </div>
                                            <div className="text-xs text-gray-400 font-mono mt-0.5">
                                                Ref: {line.name.split(']')[0].replace('[', '')}
                                            </div>
                                        </td>

                                        {/* Bultos (product_packaging_qty) */}
                                        <td className="py-3 px-6 text-right font-bold text-gray-800">
                                            {line.product_packaging_qty
                                                ? line.product_packaging_qty.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                : '0,00'
                                            }
                                        </td>

                                        {/* Empaquetado (product_packaging_id) */}
                                        <td className="py-3 px-4 text-frusangar-dark font-semibold">
                                            {line.product_packaging_id ? line.product_packaging_id[1] : ''}
                                        </td>

                                        {/* Nº Palets (palet_qty) */}
                                        <td className="py-3 px-4 text-right font-mono text-gray-600">
                                            {line.palet_qty
                                                ? line.palet_qty.toLocaleString('es-ES', { minimumFractionDigits: 5, maximumFractionDigits: 5 })
                                                : '0,00000'
                                            }
                                        </td>

                                        {/* Fmto palet (palet_id) */}
                                        <td className="py-3 px-4 text-gray-600">
                                            {line.palet_id ? line.palet_id[1] : ''}
                                        </td>

                                        {/* Cantidad (product_uom_qty) */}
                                        <td className="py-3 px-6 text-right">
                                            <span className="font-bold text-base text-gray-900">
                                                {line.product_uom_qty.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="bg-white p-4 border-t border-gray-100 flex justify-between items-center text-sm text-gray-400">
                        <span>Frusangar Visualizador v1.0</span>
                        <span>Total Líneas: {order.lines.length}</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default OrderModal;
