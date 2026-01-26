import React from 'react';
import { Package, Truck, Layers, Box } from 'lucide-react';
import { motion } from 'framer-motion';

const OrderCard = ({ order, onClick }) => {
    const lineCount = order.lines ? order.lines.length : 0;
    // Calculate total items (sum of qty)
    const totalQty = order.lines
        ? order.lines.reduce((acc, line) => acc + line.product_uom_qty, 0)
        : 0;

    // Calculate total "bultos" (packaging_qty)
    const totalBultos = order.lines
        ? order.lines.reduce((acc, line) => acc + (line.product_packaging_qty || 0), 0)
        : 0;

    // Calculate total pallets if available
    const totalPallets = order.lines
        ? order.lines.reduce((acc, line) => acc + (line.palet_qty || 0), 0) // Beware palet_qty might be 'contained qty' not 'number of pallets'. Assuming 'number of pallets' isn't explicitly summed per line usually without integer math. 
        // Actually typically pallet count is calculated by unique pallet_id or sum of pallet-type packaging.
        // If palet_qty is "quantity ON the pallet", then just counting lines with pallets might be wrong.
        // Let's assume for now Bultos is the key metric user asked for. 
        : 0;

    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-5 cursor-pointer border-l-[6px] border-frusangar-green shadow-[0_4px_20px_-5px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] transition-all duration-300 mb-4 relative overflow-hidden group w-full"
            onClick={onClick}
        >

            <div className="flex justify-between items-start z-10 relative mb-3">
                <div className="flex flex-col">
                    <span className="bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md w-fit mb-1">
                        {order.name}
                    </span>
                    <h3 className="text-xl font-black text-gray-800 line-clamp-1 leading-tight group-hover:text-frusangar-dark transition-colors">
                        {order.partner_id[1]}
                    </h3>
                </div>
                {/* Bultos Indicator (Prominent) */}
                <div className="flex flex-col items-end bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                    <span className="text-xs uppercase font-bold text-blue-400 mb-0.5">Bultos</span>
                    <div className="flex items-center text-blue-700">
                        <Box size={18} className="mr-1.5" />
                        <span className="text-xl font-black leading-none">{totalBultos > 0 ? totalBultos : '-'}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between text-gray-500 pt-3 border-t border-dashed border-gray-100">
                <div className="flex space-x-4">
                    <div className="flex items-center space-x-1.5" title="Lineas de pedido">
                        <Layers size={16} className="text-gray-400" />
                        <span className="font-semibold text-sm">{lineCount} Lín.</span>
                    </div>
                    <div className="flex items-center space-x-1.5" title="Unidades totales">
                        <Package size={16} className="text-gray-400" />
                        <span className="font-semibold text-sm">{totalQty} Uds.</span>
                    </div>
                </div>

                <div className="text-xs font-semibold flex items-center text-frusangar-green opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                    Ver Detalle →
                </div>
            </div>
        </motion.div>
    );
};

export default OrderCard;
