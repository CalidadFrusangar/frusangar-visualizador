import React, { useEffect, useState } from 'react';
import { fetchOrders } from '../api';
import OrderCard from './OrderCard';
import OrderModal from './OrderModal';
import { Loader2, RefreshCw, Calendar, Package } from 'lucide-react';

const Dashboard = () => {
    const [data, setData] = useState({ tomorrow: [], dayAfter: [] });
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await fetchOrders();
            setData(result);
            setLastUpdated(new Date());
        } catch (error) {
            console.error("Failed to fetch orders", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 60000); // Auto-refresh every 60s
        return () => clearInterval(interval);
    }, []);

    // Dates for display
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const dayAfterDate = new Date();
    dayAfterDate.setDate(dayAfterDate.getDate() + 2);

    const formatDate = (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    // Calculate total stats for header
    const totalOrders = data.tomorrow.length + data.dayAfter.length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col text-gray-900">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-200/50 shadow-sm transition-all duration-300">
                <div className="max-w-[1920px] mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center space-x-6">
                        {/* Logo Area */}
                        <div className="flex items-center space-x-3">
                            <img src="/logo.png" alt="Frusangar" className="h-10 w-auto object-contain" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                            <div className="hidden h-10 w-10 bg-frusangar-green rounded-lg items-center justify-center text-white font-black text-xl shadow-lg shadow-green-500/20">
                                F
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-2xl font-black tracking-tight text-frusangar-dark leading-none">
                                    FRUSANGAR
                                </h1>
                                <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase mt-1">
                                    Visualizador de Pedidos
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-6">
                        <div className="flex bg-white rounded-full px-4 py-2 border border-gray-100 shadow-sm space-x-6">
                            <div className="flex items-center space-x-2">
                                <div className="p-1.5 bg-green-50 text-frusangar-green rounded-full">
                                    <Calendar size={16} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Total Pedidos</span>
                                    <span className="text-sm font-bold leading-none">{totalOrders}</span>
                                </div>
                            </div>
                            <div className="w-px bg-gray-200 h-8 self-center"></div>
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Última Actualización</span>
                                <span className="text-sm font-bold leading-none">{lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>

                        <button
                            onClick={loadData}
                            className="p-3 bg-white hover:bg-gray-50 text-gray-500 hover:text-frusangar-dark rounded-full transition-all shadow-sm border border-gray-100 active:scale-95"
                            disabled={loading}
                            title="Recargar datos"
                        >
                            <RefreshCw size={20} className={loading ? "animate-spin text-frusangar-green" : ""} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-hidden h-[calc(100vh-80px)]">

                {/* Column 1: Tomorrow */}
                <div className="flex flex-col bg-white/60 backdrop-blur-sm rounded-3xl border border-white shadow-xl shadow-gray-200/50 h-full overflow-hidden relative group">
                    <div className="absolute top-0 w-full h-3 bg-gradient-to-r from-frusangar-green to-frusangar-dark"></div>
                    <div className="p-6 pb-2">
                        <div className="flex justify-between items-end border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-3xl font-black text-gray-800 capitalize tracking-tight">
                                    Mañana
                                </h2>
                                <p className="text-frusangar-dark font-bold text-lg capitalize flex items-center mt-1">
                                    <Calendar size={18} className="mr-2" />
                                    {formatDate(tomorrowDate)}
                                </p>
                            </div>
                            <span className="bg-frusangar-light text-frusangar-dark font-bold px-3 py-1 rounded-full text-sm border border-frusangar-green/20">
                                {data.tomorrow.length} Envíos
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 custom-scrollbar pb-20">
                        {loading && data.tomorrow.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 opacity-50 space-y-4">
                                <Loader2 className="animate-spin text-frusangar-green" size={40} />
                                <span className="text-sm font-semibold text-gray-400">Cargando pedidos...</span>
                            </div>
                        ) : (
                            data.tomorrow.map(order => (
                                <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                            ))
                        )}
                    </div>
                </div>

                {/* Column 2: Day After */}
                <div className="flex flex-col bg-white/60 backdrop-blur-sm rounded-3xl border border-white shadow-xl shadow-gray-200/50 h-full overflow-hidden relative group">
                    <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-amber-400 to-orange-400"></div>
                    <div className="p-6 pb-2">
                        <div className="flex justify-between items-end border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-3xl font-black text-gray-800 capitalize tracking-tight">
                                    Pasado Mañana
                                </h2>
                                <p className="text-amber-500 font-bold text-lg capitalize flex items-center mt-1">
                                    <Calendar size={18} className="mr-2" />
                                    {formatDate(dayAfterDate)}
                                </p>
                            </div>
                            <span className="bg-amber-100 text-amber-700 font-bold px-3 py-1 rounded-full text-sm">
                                {data.dayAfter.length} Envíos
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 custom-scrollbar pb-20">
                        {loading && data.dayAfter.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 opacity-50 space-y-4">
                                <Loader2 className="animate-spin text-amber-500" size={40} />
                                <span className="text-sm font-semibold text-gray-400">Cargando pedidos...</span>
                            </div>
                        ) : (
                            data.dayAfter.map(order => (
                                <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                            ))
                        )}
                    </div>
                </div>

            </main>

            {/* Modal Overlay */}
            {selectedOrder && (
                <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
            )}
        </div>
    );
};

export default Dashboard;
