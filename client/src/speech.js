// Spoken alerts for the production-line screen (Web Speech API, Spanish voice)

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voice = null;
const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    voice = voices.find(v => v.lang === 'es-ES') || voices.find(v => v.lang?.toLowerCase().startsWith('es')) || null;
};
if (speechSupported()) {
    pickVoice();
    window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export const speak = (text) => {
    if (!speechSupported() || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    if (voice) u.voice = voice;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
};

export const stopSpeaking = () => {
    if (speechSupported()) window.speechSynthesis.cancel();
};

// "PVNAV/13844" → "13844"; "(CARREFOUR) SOCIEDAD ... S.A." → "Carrefour sociedad ..."
const orderNumber = (name = '') => name.split('/').pop();
const partnerName = (name = '') => name
    .replace(/[()]/g, '')
    .replace(/,?\s*\b(S\.?A\.?U?|S\.?L\.?U?|S\.?COOP\.?|SDA\.?\s*COOP\.?)\s*$/i, '')
    .trim()
    .toLowerCase();
const changeText = (text = '') => text
    .replace(/\[[^\]]*\]\s*/g, '')
    .replace(/→/g, ' pasa a ')
    .replace(/\bKG\b/gi, 'kilos')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const INTRO = { critico: 'Atención. Cambio crítico.', alto: 'Aviso importante.', normal: 'Aviso.' };

/** Text read aloud for an event */
export function describeForSpeech(event) {
    const order = `Pedido ${orderNumber(event.orderName)} de ${partnerName(event.partner)}`;
    const day = event.dayLabel ? `, para ${event.dayLabel.toLowerCase()}` : '';

    if (event.changes?.length && event.changes.every(c => c.type === 'CAJAS_SIN_DECLARAR')) {
        return `Aviso importante. Cajas retornables sin declarar. ${order}${day}.`;
    }

    const changes = (event.changes || []).filter(c => c.priority !== 'info');
    const details = changes.slice(0, 2).map(c => changeText(c.text)).join('. ');
    const extra = changes.length - 2;
    const more = extra > 0 ? `Y ${extra === 1 ? 'un cambio más' : `${extra} cambios más`}.` : '';
    return [
        event.test ? 'Esto es una prueba.' : '',
        INTRO[event.priority] || 'Aviso.',
        `${order}${day}.`,
        event.wasValidated ? 'El albarán ya estaba validado.' : '',
        details ? `${details}.` : '',
        more,
    ].filter(Boolean).join(' ');
}
