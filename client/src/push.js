import { getPushPublicKey, subscribePush, unsubscribePush, testPush } from './api';

const urlBase64ToUint8Array = (base64) => {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

export const pushSupported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed', err));
    }
};

export const getSubscription = async () => {
    if (!pushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
};

export const enablePush = async (minPriority) => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permiso de notificaciones denegado en el navegador');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        const key = await getPushPublicKey();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    }
    await subscribePush(sub.toJSON(), minPriority);
    return sub;
};

const toBase64Url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Each time the app opens, a phone that already has notifications on tells the server again.
// Render's disk is wiped on every deploy/restart (state.json, subscriptions included): without this the
// phone kept showing «activado» but nothing arrived. If the server's VAPID key changed, subscribe again.
export const resyncPush = async (minPriority) => {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const key = await getPushPublicKey();
    const current = sub.options?.applicationServerKey ? toBase64Url(sub.options.applicationServerKey) : null;
    if (current && current !== key.replace(/=+$/, '')) {
        await sub.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    }
    await subscribePush(sub.toJSON(), minPriority);
    return true;
};

export const disablePush = async () => {
    const sub = await getSubscription();
    if (!sub) return;
    await unsubscribePush(sub.endpoint);
    await sub.unsubscribe();
};

export const sendTest = async () => {
    const sub = await getSubscription();
    if (sub) await testPush(sub.endpoint);
};

// Short beeps with WebAudio (browsers allow it after the first user interaction)
let audioCtx = null;
export const unlockAudio = () => {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* audio not available */ }
};

export const beep = (times = 1, freq = 880) => {
    if (!audioCtx) return;
    for (let i = 0; i < times; i++) {
        const start = audioCtx.currentTime + i * 0.35;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = freq;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
    }
};
