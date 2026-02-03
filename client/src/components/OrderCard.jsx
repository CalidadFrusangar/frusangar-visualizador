import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Package, Box, Truck } from 'lucide-react'; // Changed icons for better semantic

const OrderCard = ({ order, delay }) => {
    const [expanded, setExpanded] = useState(false);

    // Calculate totals - Filter out sections/notes
    // CRITICAL FIX: Use product_packaging_qty for Bultos
    const totalBultos = order.lines?.reduce((sum, line) => {
        // Skip notes/sections or lines with no product
        const isNote = line.display_type || !line.product_id || (Array.isArray(line.product_id) && line.product_id.length === 0);
        if (isNote) return sum;

        return sum + (line.product_packaging_qty || 0);
    }, 0) || 0;

    // Total Quantities (Units)
    const totalUnits = order.lines?.reduce((sum, line) => {
        const isNote = line.display_type || !line.product_id || (Array.isArray(line.product_id) && line.product_id.length === 0);
        if (isNote) return sum;

        return sum + (line.product_uom_qty || 0);
    }, 0) || 0;

    const totalLines = order.lines?.filter(l => !l.display_type && l.product_id && (Array.isArray(l.product_id) ? l.product_id.length > 0 : true)).length || 0;

    // Extract order reference from name (e.g., "PVNAV/10488" from full name)
    const orderRef = order.name?.split(' ')[0] || order.name;
    const customerName = order.partner_id ? order.partner_id[1] : 'Cliente desconocido';

    // Format date properly if available
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: delay * 0.05 }}
            className={`group bg-white rounded-xl shadow-card hover:shadow-card-hover border border-stone-100/80 transition-all duration-300 overflow-hidden mb-4 ${expanded ? 'ring-2 ring-frusangar-green/20' : ''}`}
        >
            {/* Collapsed view */}
            <div
                onClick={() => setExpanded(!expanded)}
                className="cursor-pointer relative"
            >
                <div className="p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">

                    {/* Left: Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-frusangar-light text-frusangar-dark tracking-wide uppercase border border-frusangar-green/10">
                                {orderRef}
                            </span>
                            <span className="text-xs text-stone-400 font-medium">
                                {formatDate(order.commitment_date || order.date_order)}
                            </span>
                        </div>

                        <h3 className="text-lg font-display font-bold text-frusangar-text truncate pr-4 group-hover:text-frusangar-green transition-colors">
                            {customerName}
                        </h3>

                        <div className="flex items-center gap-4 mt-3 text-xs text-frusangar-muted">
                            <div className="flex items-center gap-1.5" title="Total Líneas">
                                <span className="bg-stone-100 p-1 rounded-md text-stone-500">
                                    <Box size={14} />
                                </span>
                                <span className="font-medium">{totalLines} Lín.</span>
                            </div>
                            <div className="flex items-center gap-1.5" title="Total Unidades">
                                <span className="bg-stone-100 p-1 rounded-md text-stone-500">
                                    <Package size={14} />
                                </span>
                                <span className="font-medium">{Math.round(totalUnits).toLocaleString('es-ES')} Uds.</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Bultos Big Metric */}
                    <div className="flex items-center gap-5 sm:border-l sm:border-stone-100 sm:pl-5">
                        <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-frusangar-muted tracking-wider mb-0.5">Bultos</div>
                            <div className="flex items-baseline justify-end gap-1">
                                <span className="text-2xl font-display font-black text-frusangar-dark">
                                    {Math.round(totalBultos).toLocaleString('es-ES')}
                                </span>
                                <span className="text-frusangar-green text-xs font-semibold">
                                    <Package size={12} className="inline ml-0.5" />
                                </span>
                            </div>
                        </div>

                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${expanded ? 'bg-frusangar-green text-white rotate-180' : 'bg-stone-50 text-stone-400 group-hover:bg-frusangar-light group-hover:text-frusangar-green'}`}>
                            <ChevronDown size={18} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded view */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-stone-100 bg-stone-50/30">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead>
                                        <tr className="border-b border-stone-200/60 text-stone-400 font-semibold uppercase tracking-wider text-[10px]">
                                            <th className="py-3 px-5 pl-6 w-[30%]">Producto / Referencia</th>
                                            <th className="py-3 px-2 text-right w-[12%]">Bultos</th>
                                            <th className="py-3 px-4 w-[20%]">Empaquetado</th>
                                            <th className="py-3 px-2 text-right w-[10%]">Palets</th>
                                            <th className="py-3 px-4 w-[15%]">Formato</th>
                                            <th className="py-3 px-5 pr-6 text-right w-[13%]">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-100 bg-white">
                                        {order.lines && order.lines.map((line) => {
                                            // Handle Sections
                                            if (line.display_type === 'line_section') {
                                                return (
                                                    <tr key={line.id} className="bg-stone-100 border-y border-stone-200">
                                                        <td colSpan="6" className="py-3 px-6 font-black text-stone-800 uppercase tracking-wide text-xs">
                                                            {line.name}
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            // Handle Notes (or missing product_id, or empty array product_id)
                                            const isNote = line.display_type === 'line_note' || !line.product_id || (Array.isArray(line.product_id) && line.product_id.length === 0);

                                            if (isNote) {
                                                return (
                                                    <tr key={line.id} className="bg-amber-50/40">
                                                        <td colSpan="6" className="py-2.5 px-6 text-stone-500 italic text-[11px]">
                                                            {line.name}
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            // Regular Product Lines
                                            const productName = Array.isArray(line.product_id) ? line.product_id[1] : 'Producto desconocido';
                                            const productRef = Array.isArray(line.product_id) && line.product_id[1].match(/\[([^\]]+)\]/)
                                                ? line.product_id[1].match(/\[([^\]]+)\]/)[1]
                                                : '-';

                                            // Handle product_packaging_id being false/empty
                                            const packagingName = (Array.isArray(line.product_packaging_id) && line.product_packaging_id.length > 0)
                                                ? line.product_packaging_id[1]
                                                : (Array.isArray(line.product_uom) ? line.product_uom[1] : '-');

                                            const palletFormat = (Array.isArray(line.palet_id) && line.palet_id.length > 0) ? line.palet_id[1] : '-';

                                            return (
                                                <tr key={line.id} className="hover:bg-frusangar-light/20 transition-colors group/row">
                                                    {/* Product */}
                                                    <td className="py-3 px-5 pl-6 align-top">
                                                        <div className="font-bold text-stone-800 text-xs mb-1 group-hover/row:text-frusangar-dark transition-colors tracking-tight">
                                                            {productName.split('] ')[1] || productName}
                                                        </div>
                                                        <div className="text-[11px] text-stone-500 font-mono font-medium">
                                                            Ref: {productRef}
                                                        </div>
                                                    </td>

                                                    {/* Bultos - Highlighted */}
                                                    <td className="py-3 px-2 text-right font-bold text-frusangar-dark">
                                                        {line.product_packaging_qty ? Number(line.product_packaging_qty).toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '-'}
                                                    </td>

                                                    {/* Empaquetado */}
                                                    <td className="py-3 px-4 text-xs font-medium text-stone-600">
                                                        {packagingName}
                                                        {packagingName === '-' && <span className="text-stone-300">-</span>}
                                                    </td>

                                                    {/* Palets */}
                                                    <td className="py-3 px-2 text-right text-stone-500 font-mono text-[10px]">
                                                        {line.palet_qty > 0 ? Number(line.palet_qty).toFixed(2).replace('.', ',') : '-'}
                                                    </td>

                                                    {/* Formato Palet */}
                                                    <td className="py-3 px-4 text-[10px] text-stone-400 uppercase">
                                                        {palletFormat}
                                                    </td>

                                                    {/* Cantidad */}
                                                    <td className="py-3 px-5 pr-6 text-right font-black text-stone-900 text-sm">
                                                        {line.product_uom_qty ? Number(line.product_uom_qty).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer inside expanded */}
                            <div className="px-6 py-3 bg-stone-50 border-t border-stone-200/60 flex justify-between items-center text-[10px] text-frusangar-muted">
                                <span>ID: {order.id}</span>
                                <button className="text-frusangar-green font-bold hover:underline" onClick={(e) => { e.stopPropagation(); setExpanded(false); }}>
                                    Cerrar Detalle
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default OrderCard;
