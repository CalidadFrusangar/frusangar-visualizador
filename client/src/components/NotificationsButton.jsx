import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import { pushSupported, isIos, isStandalone, getSubscription, enablePush, disablePush, sendTest, resyncPush } from '../push';

const LEVELS = [
    { key: 'critico', label: 'Solo críticos', hint: 'Cambios en pedidos de hoy o con albarán ya validado' },
    { key: 'alto', label: 'Críticos e importantes', hint: 'Además: reducciones, eliminaciones y cambios de fecha para mañana' },
    { key: 'normal', label: 'Todos los cambios', hint: 'Además: pedidos nuevos y ampliaciones' },
];

const readLevel = () => {
    try { return localStorage.getItem('push-min-priority') || 'alto'; } catch { return 'alto'; }
};

const NotificationsButton = () => {
    const [open, setOpen] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [level, setLevel] = useState(readLevel);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    const supported = pushSupported();
    const needsInstall = isIos() && !isStandalone();

    useEffect(() => {
        getSubscription().then(sub => setEnabled(!!sub)).catch(() => {});
        // Re-register with the server (it forgets subscriptions on every Render deploy/restart)
        resyncPush(readLevel()).catch(err => console.warn('No se pudo volver a activar el aviso:', err.message));
    }, []);

    const run = async (fn, okMessage) => {
        setBusy(true);
        setMessage('');
        try {
            await fn();
            setMessage(okMessage);
        } catch (err) {
            setMessage(err.message || 'No se pudo completar');
        } finally {
            setBusy(false);
        }
    };

    const activate = (newLevel = level) => run(async () => {
        try { localStorage.setItem('push-min-priority', newLevel); } catch { /* ignore */ }
        await enablePush(newLevel);
        setEnabled(true);
        await sendTest();
    }, 'Avisos activados. Deberías recibir una notificación de prueba.');

    const deactivate = () => run(async () => {
        await disablePush();
        setEnabled(false);
    }, 'Avisos desactivados en este dispositivo.');

    const Icon = enabled ? BellRing : supported ? Bell : BellOff;

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={`p-3 rounded-full transition-all shadow-sm border active:scale-95 ${enabled ? 'bg-frusangar-green text-white border-frusangar-green' : 'bg-white text-gray-500 border-gray-100 hover:text-frusangar-dark'}`}
                title="Avisos en este dispositivo"
            >
                <Icon size={20} />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-float border border-stone-100 p-4 z-40 text-sm">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-black text-stone-800">Avisos en este dispositivo</h3>
                        <button onClick={() => setOpen(false)} className="text-stone-400"><X size={16} /></button>
                    </div>

                    {needsInstall ? (
                        <p className="text-stone-600">
                            En iPhone, primero instala la app: pulsa <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>,
                            ábrela desde el icono y vuelve a este botón.
                        </p>
                    ) : !supported ? (
                        <p className="text-stone-600">Este navegador no admite notificaciones. Usa Chrome, Edge o Safari actualizados.</p>
                    ) : (
                        <>
                            <div className="space-y-2 mb-3">
                                {LEVELS.map(l => (
                                    <label key={l.key} className={`block rounded-xl border p-2.5 cursor-pointer ${level === l.key ? 'border-frusangar-green bg-frusangar-light' : 'border-stone-200'}`}>
                                        <input
                                            type="radio"
                                            name="level"
                                            className="mr-2 accent-[#66A500]"
                                            checked={level === l.key}
                                            onChange={() => { setLevel(l.key); if (enabled) activate(l.key); }}
                                        />
                                        <span className="font-bold">{l.label}</span>
                                        <span className="block text-xs text-stone-500 ml-5">{l.hint}</span>
                                    </label>
                                ))}
                            </div>
                            {enabled ? (
                                <div className="flex gap-2">
                                    <button disabled={busy} onClick={() => run(sendTest, 'Notificación de prueba enviada.')} className="flex-1 py-2 rounded-xl bg-stone-100 font-bold text-stone-700">Probar</button>
                                    <button disabled={busy} onClick={deactivate} className="flex-1 py-2 rounded-xl bg-red-50 font-bold text-red-700">Desactivar</button>
                                </div>
                            ) : (
                                <button disabled={busy} onClick={() => activate()} className="w-full py-2.5 rounded-xl bg-frusangar-green text-white font-bold">
                                    🔔 Activar avisos
                                </button>
                            )}
                        </>
                    )}
                    {message && <p className="mt-3 text-xs text-stone-500">{message}</p>}
                </div>
            )}
        </div>
    );
};

export default NotificationsButton;
