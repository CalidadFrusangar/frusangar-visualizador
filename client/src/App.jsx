import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, AlertCircle, Calendar } from 'lucide-react';
import OrderCard from './components/OrderCard';
import logo from './assets/logo.png';

function App() {
  const [orders, setOrders] = useState({ tomorrow: [], dayAfter: [] });
  const [dates, setDates] = useState({ tomorrow: '', dayAfter: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/orders');
      setOrders({
        tomorrow: response.data.tomorrow || [],
        dayAfter: response.data.dayAfter || []
      });
      if (response.data.dates) setDates(response.data.dates);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError('Error al cargar los pedidos. ¿Está el servidor corriendo?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 300000); // 5 minutes refresh
    return () => clearInterval(interval);
  }, []);

  // Filter helpers
  const getNavalOrders = (list) => list.filter(o => o.type_id && o.type_id[0] === 1);
  const getMercaOrders = (list) => list.filter(o => o.type_id && o.type_id[0] === 5);

  const OrderSection = ({ title, orders, colorClass }) => {
    if (orders.length === 0) return null;
    return (
      <div className="mb-6">
        <h4 className={`text-md font-bold mb-3 ${colorClass}`}>
          {title}
          <span className="ml-2 text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{orders.length}</span>
        </h4>
        <div className="space-y-4">
          {orders.map((order, i) => (
            <OrderCard key={order.id} order={order} delay={i} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-frusangar-light text-stone-800 font-sans selection:bg-frusangar-green selection:text-white">

      {/* Header */}
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-sm sticky top-0 z-20 border-b border-stone-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          <div className="flex items-center">
            {/* Logo */}
            <div className="mr-4 flex-shrink-0">
              <img src={logo} alt="Frusangar Logo" className="h-10 w-auto object-contain drop-shadow-sm" />
            </div>
            <div className="hidden md:block h-8 w-px bg-stone-200 mx-4"></div>
            <h1 className="text-xl font-display font-bold tracking-tight text-frusangar-text">
              Visualizador de Pedidos
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-lg border border-stone-200/50 text-xs font-medium text-stone-500">
              <span className="w-1.5 h-1.5 rounded-full bg-frusangar-green animate-pulse"></span>
              Actualizado: {lastUpdated.toLocaleTimeString()}
            </span>
            <button
              onClick={fetchOrders}
              disabled={loading}
              className="p-2.5 rounded-xl bg-frusangar-green hover:bg-frusangar-dark text-white shadow-lg shadow-frusangar-green/20 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none"
              title="Actualizar pedidos"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center shadow-sm">
            <AlertCircle className="mr-2" size={20} />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Column 1: Mañana */}
          <section>
            <div className="flex items-center mb-6 pb-2 border-b-2 border-frusangar-green/30">
              <Calendar className="mr-2 text-frusangar-green" size={24} />
              <h2 className="text-2xl font-bold text-frusangar-dark">Mañana</h2>
              <span className="ml-auto text-sm font-bold text-frusangar-dark bg-white border border-frusangar-green/20 px-3 py-1 rounded-full shadow-sm">
                {dates.tomorrow || 'Cargando...'}
              </span>
            </div>

            {loading && !orders.tomorrow.length ? (
              <div className="animate-pulse space-y-4">
                {[1, 2].map(i => <div key={i} className="h-32 bg-white rounded-xl shadow-sm border border-frusangar-green/10"></div>)}
              </div>
            ) : orders.tomorrow.length === 0 ? (
              <div className="bg-white/50 p-12 rounded-xl text-center border-dashed border-2 border-stone-200">
                <p className="text-frusangar-brown font-medium">No hay pedidos programados para mañana.</p>
              </div>
            ) : (
              <>
                <OrderSection title="Navalcarnero" orders={getNavalOrders(orders.tomorrow)} colorClass="text-emerald-700" />
                <OrderSection title="Mercamadrid Interno" orders={getMercaOrders(orders.tomorrow)} colorClass="text-blue-700" />
              </>
            )}
          </section>

          {/* Column 2: Pasado Mañana */}
          <section>
            <div className="flex items-center mb-6 pb-2 border-b-2 border-frusangar-orange/30">
              <Calendar className="mr-2 text-frusangar-orange" size={24} />
              <h2 className="text-2xl font-bold text-frusangar-dark">Pasado Mañana</h2>
              <span className="ml-auto text-sm font-bold text-frusangar-dark bg-white border border-frusangar-orange/20 px-3 py-1 rounded-full shadow-sm">
                {dates.dayAfter || 'Cargando...'}
              </span>
            </div>

            {loading && !orders.dayAfter.length ? (
              <div className="animate-pulse space-y-4">
                {[1, 2].map(i => <div key={i} className="h-32 bg-white rounded-xl shadow-sm border border-frusangar-orange/10"></div>)}
              </div>
            ) : orders.dayAfter.length === 0 ? (
              <div className="bg-white/50 p-12 rounded-xl text-center border-dashed border-2 border-stone-200">
                <p className="text-frusangar-brown font-medium">No hay pedidos programados para pasado mañana.</p>
              </div>
            ) : (
              <>
                <OrderSection title="Navalcarnero" orders={getNavalOrders(orders.dayAfter)} colorClass="text-emerald-700" />
                <OrderSection title="Mercamadrid Interno" orders={getMercaOrders(orders.dayAfter)} colorClass="text-blue-700" />
              </>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

export default App;
