export const PRIORITY_RANK = { info: 0, normal: 1, alto: 2, critico: 3 };

export const PRIORITY_STYLE = {
    critico: { label: 'Crítico', chip: 'bg-red-600 text-white', soft: 'bg-red-50 border-red-200 text-red-800', ring: 'ring-red-500', dot: 'bg-red-500' },
    alto: { label: 'Importante', chip: 'bg-orange-500 text-white', soft: 'bg-orange-50 border-orange-200 text-orange-800', ring: 'ring-orange-400', dot: 'bg-orange-500' },
    normal: { label: 'Cambio', chip: 'bg-sky-600 text-white', soft: 'bg-sky-50 border-sky-200 text-sky-800', ring: 'ring-sky-400', dot: 'bg-sky-500' },
    info: { label: 'Info', chip: 'bg-emerald-600 text-white', soft: 'bg-emerald-50 border-emerald-200 text-emerald-800', ring: 'ring-emerald-400', dot: 'bg-emerald-500' },
};

// New orders get their own colour; the urgency still drives sound, voice, full-screen alert and push
export const NEW_ORDER_STYLE = {
    label: 'Pedido nuevo', chip: 'bg-violet-600 text-white', soft: 'bg-violet-50 border-violet-200 text-violet-900', ring: 'ring-violet-500', dot: 'bg-violet-500',
};

export const isNewOrderEvent = (e) => !!e?.changes?.some(c => c.type === 'NUEVO_PEDIDO');

// Pricelist offers (not order changes): their own colour in the alert list
export const OFFER_STYLE = {
    label: 'Oferta', chip: 'bg-fuchsia-600 text-white', soft: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900', ring: 'ring-fuchsia-400', dot: 'bg-fuchsia-500',
};

export const isOfferEvent = (e) => e?.kind === 'oferta';

export const eventStyle = (e) => (isOfferEvent(e) ? OFFER_STYLE : isNewOrderEvent(e) ? NEW_ORDER_STYLE : PRIORITY_STYLE[e.priority]);

export const OFFER_STATUS = {
    vigente: { label: 'En vigor', short: 'En vigor', dot: 'bg-fuchsia-500', chip: 'bg-fuchsia-600 text-white', card: 'bg-white border-fuchsia-200' },
    proxima: { label: 'Próximas', short: 'Próxima', dot: 'bg-sky-500', chip: 'bg-sky-100 text-sky-800', card: 'bg-white border-stone-200' },
    terminada: { label: 'Terminadas (última semana)', short: 'Terminada', dot: 'bg-stone-400', chip: 'bg-stone-100 text-stone-500', card: 'bg-stone-50 border-stone-200 opacity-80' },
};

const dayMonth = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');

// Compact form for tight spots (order lines): «17/10 → 27/10»
export const offerShortWindow = (o) => {
    if (o.start && o.end) return `${dayMonth(o.start)} → ${dayMonth(o.end)}`;
    if (o.end) return `hasta ${dayMonth(o.end)}`;
    if (o.start) return `desde ${dayMonth(o.start)}`;
    return 'sin fechas';
};

// Delivery window of an offer (information; the offer itself is the ORDER window in start/end)
export const offerDeliveryText = (o) => offerWindowText({ start: o.deliveryStart, end: o.deliveryEnd });

export const offerWindowText = (o) => {
    if (o.start && o.end) return `del ${dayMonth(o.start)} al ${dayMonth(o.end)}`;
    if (o.end) return `hasta el ${dayMonth(o.end)}`;
    if (o.start) return `desde el ${dayMonth(o.start)}`;
    return 'sin fechas';
};

export const PICKING_STYLE = {
    validado: { label: 'Albarán hecho', icon: '✔', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    parcial: { label: 'Albarán parcial', icon: '◐', className: 'bg-amber-100 text-amber-800 border-amber-300' },
    pendiente: { label: 'Pendiente', icon: '⏳', className: 'bg-stone-100 text-stone-600 border-stone-200' },
};

// Returnable box (Euro Pool / IFCO) declaration, from x_cajas_declaradas on the delivery note.
// Only delivery notes whose lots used returnable boxes need it.
export const BOX_STYLE = {
    declarada: { label: 'Cajas declaradas', icon: '📦✔', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    sin_declarar: { label: 'SIN declarar', icon: '📦✖', className: 'bg-red-600 text-white border-red-700' },
};

export const boxTitle = (boxes) => [
    boxes.boxes?.length ? `Caja retornable: ${boxes.boxes.join(', ')}` : '',
    ...(boxes.detail || []),
].filter(Boolean).join(' · ');

export const maxPriority = (events) =>
    events.reduce((best, e) => (PRIORITY_RANK[e.priority] > PRIORITY_RANK[best] ? e.priority : best), 'info');

export const timeAgo = (iso, now = Date.now()) => {
    const min = Math.round((now - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
};

export const clockTime = (iso) =>
    new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
