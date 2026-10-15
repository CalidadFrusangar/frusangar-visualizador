import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle, Volume2, VolumeX, Megaphone, FlaskConical } from 'lucide-react';
import { fetchOrders, fetchEvents, getSession, onUnauthorized, ackEvent } from './api';
import { unlockAudio, beep } from './push';
import { speak, stopSpeaking, describeForSpeech, speechSupported } from './speech';
import DayColumn from './components/DayColumn';
import ChangesPanel from './components/ChangesPanel';
import CriticalAlert from './components/CriticalAlert';
import NotificationsButton from './components/NotificationsButton';
import Login from './components/Login';
import DemoAlerts from './components/DemoAlerts';
import EmployeePicker from './components/EmployeePicker';
import OdooLink from './components/OdooLink';
import { demoEvent, DEMO_COUNT } from './demoAlerts';
import logo from './assets/logo.png';

const REFRESH_MS = 20_000;
// Alerts sync faster: a new alert, or one marked as seen elsewhere, reaches every screen quickly
const EVENTS_MS = 5_000;
const FOCUS_MS = 10_000;
// A critical alert repeats (beeps + voice) until someone presses "Visto"
const REPEAT_MS = 30_000;
// Gap between alerts when playing every test alert in a row
const DEMO_GAP_MS = 12_000;

const DAYS = [
  { key: 'today', title: 'Hoy', accent: { border: 'border-red-400/40', icon: 'text-red-500', chip: 'border-red-200' } },
  { key: 'tomorrow', title: 'Mañana', accent: { border: 'border-frusangar-green/30', icon: 'text-frusangar-green', chip: 'border-frusangar-green/20' } },
  { key: 'dayAfter', title: 'Pasado Mañana', accent: { border: 'border-frusangar-orange/30', icon: 'text-frusangar-orange', chip: 'border-frusangar-orange/20' } },
];

const TABS = [...DAYS.map(d => ({ key: d.key, label: d.title === 'Pasado Mañana' ? 'Pasado' : d.title })), { key: 'events', label: 'Avisos' }];

const readFlag = (key) => {
  try { return localStorage.getItem(key) === 'on'; } catch { return false; }
};
const saveFlag = (key, on) => {
  try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* ignore */ }
};

const DAY_FILTERS = [{ key: 'all', label: 'Todos' }, ...DAYS.map(d => ({ key: d.key, label: `Solo ${d.title.toLowerCase()}` }))];

const readDayFilter = () => {
  try { return DAY_FILTERS.some(f => f.key === localStorage.getItem('dayFilter')) ? localStorage.getItem('dayFilter') : 'all'; } catch { return 'all'; }
};

// ?probar opens the test alerts panel
const wantsDemo = () => new URLSearchParams(window.location.search).has('probar');

const initialFocus = () => Number(new URLSearchParams(window.location.search).get('order')) || null;

function Dashboard() {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tab, setTab] = useState('today');
  const [focusOrderId, setFocusOrderId] = useState(initialFocus);
  const [focusSeq, setFocusSeq] = useState(0); // bumps on every click so the same order scrolls again
  const [missingOrder, setMissingOrder] = useState(null); // { orderId, orderName } not in today..day after
  const [alertEvent, setAlertEvent] = useState(null);
  const [ackTarget, setAckTarget] = useState(null); // { event, openOrder } while choosing who saw it
  const [soundOn, setSoundOn] = useState(() => readFlag('sound'));
  const [voiceOn, setVoiceOn] = useState(() => readFlag('voice'));
  const [dayFilter, setDayFilter] = useState(readDayFilter);

  const seenEvents = useRef(null);
  const soundRef = useRef(soundOn);
  const voiceRef = useRef(voiceOn);
  const [demoOpen, setDemoOpen] = useState(wantsDemo);
  const [testEvents, setTestEvents] = useState([]);
  const [demoStep, setDemoStep] = useState(null); // index while playing all
  const demoTimer = useRef(null);

  // Beeps first, then the spoken description
  const announce = useCallback((event) => {
    const critical = event.priority === 'critico';
    if (soundRef.current) beep(critical ? 3 : 1, critical ? 988 : 660);
    if (voiceRef.current) setTimeout(() => speak(describeForSpeech(event)), soundRef.current ? (critical ? 1100 : 450) : 0);
  }, []);
  const focusTimer = useRef(null);

  const handleEvents = useCallback((evts) => {
    setEvents(evts);
    // Seen on another screen or phone: close it here too
    setAlertEvent(a => {
      if (a && !a.test && evts.find(e => e.id === a.id)?.ack) {
        stopSpeaking();
        return null;
      }
      return a;
    });
    setAckTarget(t => (t && !t.event.test && evts.find(e => e.id === t.event.id)?.ack ? null : t));

    // Alert on events that arrived since the previous check (not on first load), unless already seen
    if (seenEvents.current) {
      const fresh = evts.filter(e => !seenEvents.current.has(e.id) && !e.ack);
      const critical = fresh.find(e => e.priority === 'critico');
      const important = fresh.find(e => e.priority === 'alto');
      if (critical) {
        setAlertEvent(critical);
        announce(critical);
      } else if (important) {
        announce(important);
      }
    }
    seenEvents.current = new Set(evts.map(e => e.id));
  }, [announce]);

  const syncEvents = useCallback(async () => {
    try {
      handleEvents(await fetchEvents(60));
    } catch { /* the next full load reports errors */ }
  }, [handleEvents]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, evts] = await Promise.all([fetchOrders(), fetchEvents(60)]);
      setData(orders);
      handleEvents(evts);
      setError(orders.error ? `Odoo no responde (${orders.error}). Mostrando últimos datos.` : null);
      setLastUpdated(new Date());

    } catch (err) {
      console.error(err);
      setError('Error al cargar los pedidos. ¿Está el servidor corriendo?');
    } finally {
      setLoading(false);
    }
  }, [handleEvents]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    const eventsInterval = setInterval(syncEvents, EVENTS_MS);
    return () => { clearInterval(interval); clearInterval(eventsInterval); };
  }, [load, syncEvents]);

  // Clear the highlight of an order opened from a notification link
  useEffect(() => {
    if (!focusOrderId) return;
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocusOrderId(null), FOCUS_MS);
    return () => clearTimeout(focusTimer.current);
  }, [focusOrderId]);

  // Browsers only allow audio after a user interaction
  useEffect(() => {
    if (!soundOn && !voiceOn) return;
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [soundOn, voiceOn]);

  // Critical alert: repeat until acknowledged
  useEffect(() => {
    if (!alertEvent || ackTarget) return;
    const t = setInterval(() => announce(alertEvent), REPEAT_MS);
    return () => clearInterval(t);
  }, [alertEvent, ackTarget, announce]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current = next;
    saveFlag('sound', next);
    if (next) { unlockAudio(); beep(1); }
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceRef.current = next;
    saveFlag('voice', next);
    if (next) speak('Voz de avisos activada.');
    else stopSpeaking();
  };

  // Test alerts: shown and sounded like real ones, never sent or stored
  const tryDemo = useCallback((i) => {
    const event = demoEvent(i, data?.orders);
    setTestEvents(list => [event, ...list]);
    setAlertEvent(event.priority === 'critico' ? event : null);
    if (event.priority === 'critico' || event.priority === 'alto') announce(event);
    else stopSpeaking();
  }, [data, announce]);

  const stopDemo = useCallback(() => {
    clearTimeout(demoTimer.current);
    setDemoStep(null);
  }, []);

  const playDemo = useCallback((i) => {
    if (i >= DEMO_COUNT) return stopDemo();
    setDemoStep(i);
    tryDemo(i);
    demoTimer.current = setTimeout(() => playDemo(i + 1), DEMO_GAP_MS);
  }, [tryDemo, stopDemo]);

  useEffect(() => () => clearTimeout(demoTimer.current), []);

  const chooseDayFilter = useCallback((key) => {
    setDayFilter(key);
    try { localStorage.setItem('dayFilter', key); } catch { /* ignore */ }
  }, []);

  const selectOrder = useCallback((orderId, orderName) => {
    stopSpeaking();
    setAlertEvent(null);
    const day = data && DAYS.find(d => data.orders[d.key]?.some(o => o.id === orderId));
    if (!day) {
      setMissingOrder(orderId ? { orderId, orderName } : null);
      return;
    }
    setMissingOrder(null);
    setFocusOrderId(orderId);
    setFocusSeq(n => n + 1);
    setTab(day.key);
    setDayFilter(f => (f === 'all' ? f : day.key));
  }, [data]);

  useEffect(() => {
    if (!missingOrder) return;
    const t = setTimeout(() => setMissingOrder(null), 8000);
    return () => clearTimeout(t);
  }, [missingOrder]);

  const closeAlert = useCallback(() => {
    stopSpeaking();
    setAlertEvent(null);
  }, []);

  // "Visto": choose who saw it, save it (test alerts only locally), then close / open the order
  const requestAck = useCallback((event, openOrder = false) => {
    stopSpeaking();
    setAckTarget({ event, openOrder });
  }, []);

  const confirmAck = useCallback(async (employee) => {
    const { event, openOrder } = ackTarget;
    if (event.test) {
      const ack = { employeeId: employee.id, name: employee.name, at: new Date().toISOString() };
      setTestEvents(list => list.map(e => (e.id === event.id ? { ...e, ack } : e)));
    } else {
      const saved = await ackEvent(event.id, employee.id);
      setEvents(list => list.map(e => (e.id === saved.id ? saved : e)));
    }
    setAckTarget(null);
    if (alertEvent?.id === event.id) closeAlert();
    if (openOrder && event.orderId) selectOrder(event.orderId, event.orderName);
  }, [ackTarget, alertEvent, closeAlert, selectOrder]);

  const ordersOf = (key) => data?.orders?.[key] || [];
  const dateOf = (key) => data?.days?.find(d => d.key === key)?.date;
  const undeclaredBoxes = DAYS.flatMap(d => ordersOf(d.key))
    .filter(o => o.state !== 'cancel' && o.boxes?.status === 'sin_declarar').length;
  const pendingToday = ordersOf('today').filter(o => o.state !== 'cancel' && o.pickingStatus !== 'validado').length;
  const importantEvents = events.filter(e => (e.priority === 'critico' || e.priority === 'alto') && Date.now() - new Date(e.ts) < 3 * 3600_000).length;

  return (
    <div className="min-h-screen bg-frusangar-light text-stone-800 font-sans selection:bg-frusangar-green selection:text-white">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md shadow-sm sticky top-0 z-30 border-b border-stone-200/60">
        <div className="px-4 sm:px-6 lg:px-8 h-16 lg:h-20 flex justify-between items-center gap-3">
          <div className="flex items-center min-w-0">
            <div className="mr-4 flex-shrink-0">
              <img src={logo} alt="Frusangar Logo" className="h-9 lg:h-10 w-auto object-contain drop-shadow-sm" />
            </div>
            <div className="hidden md:block h-8 w-px bg-stone-200 mx-4"></div>
            <h1 className="hidden sm:block text-xl font-display font-bold tracking-tight text-frusangar-text truncate">
              Visualizador de Pedidos
            </h1>
          </div>

          <div className="flex items-center gap-2 lg:gap-3">
            {undeclaredBoxes > 0 && (
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold animate-pulse"
                title="Albaranes validados con cajas retornables (Euro Pool / IFCO) sin declarar"
              >
                📦 {undeclaredBoxes} sin declarar
              </span>
            )}
            <span className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-lg border border-stone-200/50 text-xs font-medium text-stone-500">
              Hoy por hacer: <span className="font-bold text-frusangar-orange">{pendingToday}</span>
            </span>
            <span className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-lg border border-stone-200/50 text-xs font-medium text-stone-500">
              <span className="w-1.5 h-1.5 rounded-full bg-frusangar-green animate-pulse"></span>
              Actualizado: {lastUpdated ? lastUpdated.toLocaleTimeString('es-ES') : '—'}
            </span>
            <button
              onClick={toggleSound}
              className="p-2.5 rounded-xl bg-white text-stone-500 hover:text-frusangar-dark border border-stone-200 active:scale-95"
              title={soundOn ? 'Sonido de avisos activado' : 'Activar sonido de avisos (pantalla de planta)'}
            >
              {soundOn ? <Volume2 size={20} className="text-frusangar-green" /> : <VolumeX size={20} />}
            </button>
            {speechSupported() && (
              <button
                onClick={toggleVoice}
                className="p-2.5 rounded-xl bg-white text-stone-500 hover:text-frusangar-dark border border-stone-200 active:scale-95"
                title={voiceOn ? 'Voz de avisos activada' : 'Activar voz de avisos (lee los avisos en voz alta)'}
              >
                <Megaphone size={20} className={voiceOn ? 'text-frusangar-green' : ''} />
              </button>
            )}
            <button
              onClick={() => setDemoOpen(true)}
              className="hidden sm:block p-2.5 rounded-xl bg-white text-stone-500 hover:text-frusangar-dark border border-stone-200 active:scale-95"
              title="Probar avisos (sonidos, voz y pantallas de aviso)"
            >
              <FlaskConical size={20} />
            </button>
            <NotificationsButton />
            <button
              onClick={load}
              disabled={loading}
              className="p-2.5 rounded-xl bg-frusangar-green hover:bg-frusangar-dark text-white shadow-lg shadow-frusangar-green/20 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none"
              title="Actualizar pedidos"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <nav className="lg:hidden flex border-t border-stone-100 bg-white">
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

      {/* Day filter (desktop / TV) */}
      <div className="hidden lg:flex items-center gap-2 px-8 pt-5">
        {DAY_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => chooseDayFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${dayFilter === f.key ? 'bg-frusangar-green text-white border-frusangar-green shadow-sm' : 'bg-white text-stone-500 border-stone-200 hover:text-frusangar-dark hover:border-frusangar-green/40'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center shadow-sm">
          <AlertCircle className="mr-2 shrink-0" size={20} />
          {error}
        </div>
      )}

      {/* Main: 3 day columns + changes panel */}
      <main className="px-4 sm:px-6 lg:px-8 py-6 lg:pt-5 lg:pb-8 grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_300px] gap-8 items-start">
        {DAYS.map(d => (
          <DayColumn
            key={d.key}
            title={d.title}
            date={dateOf(d.key)}
            orders={ordersOf(d.key)}
            accent={d.accent}
            loading={loading && !data}
            focusOrderId={focusOrderId}
            focusSeq={focusSeq}
            wide={dayFilter === d.key}
            className={`${tab === d.key ? 'flex' : 'hidden'} ${dayFilter === 'all' ? 'lg:flex' : dayFilter === d.key ? 'lg:flex lg:col-span-3' : 'lg:hidden'}`}
          />
        ))}
        <ChangesPanel
          events={[...testEvents, ...events]}
          onSelectOrder={selectOrder}
          onAck={requestAck}
          className={`${tab === 'events' ? 'flex' : 'hidden'} lg:flex lg:col-span-3 xl:col-span-1 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)]`}
        />
      </main>

      <CriticalAlert event={alertEvent} onClose={() => requestAck(alertEvent)} onOpen={() => requestAck(alertEvent, true)} />

      {missingOrder && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md bg-stone-800 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 text-sm">
          <span className="flex-1">
            <b>{missingOrder.orderName || 'Este pedido'}</b> ya no está en Hoy, Mañana ni Pasado.
          </span>
          <OdooLink orderId={missingOrder.orderId} label="Abrir en Odoo" className="!text-xs" />
          <button onClick={() => setMissingOrder(null)} className="text-stone-400 hover:text-white font-bold" title="Cerrar">✕</button>
        </div>
      )}

      <EmployeePicker event={ackTarget?.event} onPick={confirmAck} onCancel={() => setAckTarget(null)} />

      <DemoAlerts
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onTry={(i) => { stopDemo(); setDemoOpen(false); tryDemo(i); }}
        onPlayAll={() => { setDemoOpen(false); playDemo(0); }}
        soundOn={soundOn}
        voiceOn={voiceOn}
      />

      {demoStep !== null && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-2.5 rounded-full bg-stone-900 text-white text-sm font-bold shadow-float">
          🧪 Prueba de avisos {demoStep + 1} de {DEMO_COUNT}
          <button onClick={() => { stopDemo(); closeAlert(); }} className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25">Parar</button>
        </div>
      )}
    </div>
  );
}

// PIN gate: the dashboard (and its polling) only mounts once the session is valid
function App() {
  const [session, setSession] = useState(null); // null = checking

  const check = useCallback(() => getSession()
    .then(setSession)
    .catch(() => setSession({ authenticated: false, configured: true })), []);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession({ authenticated: false, configured: true }));
    return onUnauthorized(() => setSession(s => (s?.authenticated ? { ...s, authenticated: false } : s)));
  }, [check]);

  if (!session) return <div className="min-h-screen bg-frusangar-light" />;
  if (!session.authenticated) return <Login onSuccess={check} notConfigured={!session.configured} />;
  return <Dashboard />;
}

export default App;
