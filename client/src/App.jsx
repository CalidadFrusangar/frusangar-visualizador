import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle, Volume2, VolumeX } from 'lucide-react';
import { fetchOrders, fetchEvents } from './api';
import { unlockAudio, beep } from './push';
import DayColumn from './components/DayColumn';
import ChangesPanel from './components/ChangesPanel';
import CriticalAlert from './components/CriticalAlert';
import NotificationsButton from './components/NotificationsButton';
import logo from './assets/logo.png';

const REFRESH_MS = 20_000;
const FOCUS_MS = 10_000;

const DAYS = [
  { key: 'today', title: 'Hoy', accent: { bar: 'bg-gradient-to-r from-red-500 to-frusangar-orange', text: 'text-frusangar-orange', chip: 'bg-frusangar-orange-light text-frusangar-orange' } },
  { key: 'tomorrow', title: 'Mañana', accent: { bar: 'bg-gradient-to-r from-frusangar-green to-frusangar-dark', text: 'text-frusangar-dark', chip: 'bg-frusangar-light text-frusangar-dark border border-frusangar-green/20' } },
  { key: 'dayAfter', title: 'Pasado Mañana', accent: { bar: 'bg-gradient-to-r from-amber-400 to-orange-400', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700' } },
];

const TABS = [...DAYS.map(d => ({ key: d.key, label: d.title === 'Pasado Mañana' ? 'Pasado' : d.title })), { key: 'events', label: 'Avisos' }];

const readSound = () => {
  try { return localStorage.getItem('sound') === 'on'; } catch { return false; }
};

const initialFocus = () => Number(new URLSearchParams(window.location.search).get('order')) || null;

function App() {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tab, setTab] = useState('today');
  const [focusOrderId, setFocusOrderId] = useState(initialFocus);
  const [alertEvent, setAlertEvent] = useState(null);
  const [soundOn, setSoundOn] = useState(readSound);

  const seenEvents = useRef(null);
  const soundRef = useRef(soundOn);
  const focusTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, evts] = await Promise.all([fetchOrders(), fetchEvents(60)]);
      setData(orders);
      setEvents(evts);
      setError(orders.error ? `Odoo no responde (${orders.error}). Mostrando últimos datos.` : null);
      setLastUpdated(new Date());

      // Alert on events that arrived since the previous refresh (not on first load)
      if (seenEvents.current) {
        const fresh = evts.filter(e => !seenEvents.current.has(e.id));
        const critical = fresh.find(e => e.priority === 'critico');
        if (critical) {
          setAlertEvent(critical);
          if (soundRef.current) beep(3, 988);
        } else if (soundRef.current && fresh.some(e => e.priority === 'alto')) {
          beep(1, 660);
        }
      }
      seenEvents.current = new Set(evts.map(e => e.id));
    } catch (err) {
      console.error(err);
      setError('Error al cargar los pedidos. ¿Está el servidor corriendo?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Clear the highlight of an order opened from a notification link
  useEffect(() => {
    if (!focusOrderId) return;
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocusOrderId(null), FOCUS_MS);
    return () => clearTimeout(focusTimer.current);
  }, [focusOrderId]);

  // Browsers only allow audio after a user interaction
  useEffect(() => {
    if (!soundOn) return;
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [soundOn]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current = next;
    try { localStorage.setItem('sound', next ? 'on' : 'off'); } catch { /* ignore */ }
    if (next) { unlockAudio(); beep(1); }
  };

  const selectOrder = useCallback((orderId) => {
    setAlertEvent(null);
    setFocusOrderId(orderId);
    const day = data && DAYS.find(d => data.orders[d.key]?.some(o => o.id === orderId));
    if (day) setTab(day.key);
  }, [data]);

  const closeAlert = useCallback(() => setAlertEvent(null), []);

  const ordersOf = (key) => data?.orders?.[key] || [];
  const dateOf = (key) => data?.days?.find(d => d.key === key)?.date;
  const pendingToday = ordersOf('today').filter(o => o.state !== 'cancel' && o.pickingStatus !== 'validado').length;
  const importantEvents = events.filter(e => (e.priority === 'critico' || e.priority === 'alto') && Date.now() - new Date(e.ts) < 3 * 3600_000).length;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-30 border-b border-gray-200/50 shadow-sm">
        <div className="px-4 lg:px-6 py-3 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logo} alt="Frusangar" className="h-9 lg:h-10 w-auto object-contain" />
            <div className="hidden sm:block h-8 w-px bg-stone-200"></div>
            <span className="hidden sm:block text-xs font-semibold tracking-widest text-gray-400 uppercase">
              Pedidos Navalcarnero
            </span>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <div className="hidden md:flex bg-white rounded-full px-4 py-2 border border-gray-100 shadow-sm gap-5">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400">Hoy por hacer</span>
                <span className="text-sm font-black leading-none text-frusangar-orange">{pendingToday}</span>
              </div>
              <div className="w-px bg-gray-200"></div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400">Última actualización</span>
                <span className="text-sm font-bold leading-none">
                  {lastUpdated ? lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                </span>
              </div>
            </div>

            <button
              onClick={toggleSound}
              className="p-3 bg-white text-gray-500 hover:text-frusangar-dark rounded-full shadow-sm border border-gray-100 active:scale-95"
              title={soundOn ? 'Sonido de avisos activado' : 'Activar sonido de avisos (pantalla de planta)'}
            >
              {soundOn ? <Volume2 size={20} className="text-frusangar-green" /> : <VolumeX size={20} />}
            </button>
            <NotificationsButton />
            <button
              onClick={load}
              className="p-3 bg-white text-gray-500 hover:text-frusangar-dark rounded-full shadow-sm border border-gray-100 active:scale-95"
              disabled={loading}
              title="Recargar datos"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin text-frusangar-green' : ''} />
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <nav className="lg:hidden flex border-t border-gray-100 bg-white">
          {TABS.map(t => {
            const count = t.key === 'events' ? importantEvents : ordersOf(t.key).filter(o => o.state !== 'cancel').length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition-colors ${tab === t.key ? 'border-frusangar-green text-frusangar-dark' : 'border-transparent text-stone-400'}`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${t.key === 'events' ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-600'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {error && (
        <div className="mx-4 lg:mx-6 mt-3 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center text-sm">
          <AlertCircle className="mr-2 shrink-0" size={18} />
          {error}
        </div>
      )}

      {/* Main: 3 day columns + changes panel */}
      <main className="flex-1 min-h-0 p-3 lg:p-5 grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[1fr_auto] xl:grid-rows-1 xl:grid-cols-[1fr_1fr_1fr_340px] gap-4 lg:gap-5">
        {DAYS.map(d => (
          <DayColumn
            key={d.key}
            title={d.title}
            date={dateOf(d.key)}
            orders={ordersOf(d.key)}
            accent={d.accent}
            loading={loading && !data}
            focusOrderId={focusOrderId}
            className={tab === d.key ? 'flex' : 'hidden lg:flex'}
          />
        ))}
        <ChangesPanel
          events={events}
          onSelectOrder={selectOrder}
          className={`${tab === 'events' ? 'flex' : 'hidden'} lg:flex lg:col-span-3 lg:max-h-64 xl:max-h-none xl:col-span-1`}
        />
      </main>

      <CriticalAlert event={alertEvent} onClose={closeAlert} onOpen={selectOrder} />
    </div>
  );
}

export default App;
