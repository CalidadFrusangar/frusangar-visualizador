// Every kind of alert the server can produce (see server/diff.js and server/boxes.js),
// built on real orders of the screen so they look like the real thing. Nothing is sent anywhere.
export const SCENARIOS = [
    { priority: 'critico', when: 'Cualquier cambio en un pedido de hoy', day: 'today', type: 'AUMENTO', text: 'PATATA LAVADA SACO 10 KG: 40 bultos → 60 bultos (+20 bultos)' },
    { priority: 'critico', when: 'Cambio en un pedido con el albarán ya validado', day: 'tomorrow', validated: true, type: 'DISMINUCION', text: 'PATATA CEPILLADA SACO 25 KG: 30 bultos → 20 bultos (-10 bultos)' },
    { priority: 'critico', when: 'Pedido nuevo para hoy', day: 'today', type: 'NUEVO_PEDIDO', text: 'Pedido nuevo' },
    { priority: 'critico', when: 'Pedido adelantado a hoy', day: 'today', type: 'CAMBIO_FECHA', text: 'Fecha cambiada: vie 16 oct → jue 15 oct' },
    { priority: 'alto', when: 'Reducción en un pedido de mañana', day: 'tomorrow', type: 'DISMINUCION', text: 'PATATA FREIR SACO 10 KG: 100 bultos → 60 bultos (-40 bultos)' },
    { priority: 'alto', when: 'Línea quitada en un pedido de mañana', day: 'tomorrow', type: 'LINEA_ELIMINADA', text: '− PATATA GUARNICION X 10 KG eliminado (30 bultos)' },
    { priority: 'alto', when: 'Pedido de mañana cancelado', day: 'tomorrow', type: 'CANCELADO', text: 'Pedido cancelado' },
    { priority: 'alto', when: 'Cambio de fecha de un pedido de mañana', day: 'tomorrow', type: 'CAMBIO_FECHA', text: 'Fecha cambiada: vie 16 oct → sáb 17 oct' },
    { priority: 'alto', when: 'Cajas retornables sin declarar 2 h después de validar', day: 'today', type: 'CAJAS_SIN_DECLARAR', text: 'Euro Pool 156 sin declarar · albarán FRU/FRUSAL//13470 validado a las 10:00' },
    { priority: 'normal', when: 'Ampliación en un pedido de mañana', day: 'tomorrow', type: 'AUMENTO', text: 'PATATA FREIR SACO 10 KG: 60 bultos → 80 bultos (+20 bultos)' },
    { priority: 'normal', when: 'Pedido nuevo para pasado mañana', day: 'dayAfter', type: 'NUEVO_PEDIDO', text: 'Pedido nuevo' },
    { priority: 'info', when: 'Albarán validado', day: 'today', type: 'ALBARAN_VALIDADO', text: 'Albarán validado' },
];

const DAY_LABEL = { today: 'Hoy', tomorrow: 'Mañana', dayAfter: 'Pasado mañana' };

export const EFFECT = {
    critico: 'Pantalla completa · 3 pitidos · voz · se repite hasta «Visto» · móvil (vibración larga)',
    alto: '1 pitido · voz · panel de avisos · móvil',
    normal: 'Sin sonido · panel de avisos · móvil (si lo pide)',
    info: 'Sin sonido · solo panel de avisos',
};

export const DEMO_COUNT = SCENARIOS.length;

/** Fake event for scenario i, on a real order of that day when there is one */
export function demoEvent(i, orders) {
    const s = SCENARIOS[i];
    const list = orders?.[s.day]?.length ? orders[s.day] : (orders?.today || orders?.tomorrow || []);
    const o = list[i % Math.max(list.length, 1)];
    return {
        id: `prueba-${i}-${Date.now()}`,
        test: true,
        ts: new Date().toISOString(),
        priority: s.priority,
        orderId: o?.id,
        orderName: o?.name || 'PVNAV/00000',
        partner: o?.partner_id?.[1] || 'Cliente de prueba',
        dayKey: s.day,
        dayLabel: DAY_LABEL[s.day],
        wasValidated: !!s.validated,
        changes: [{ type: s.type, priority: s.priority, text: s.text }],
        summary: s.text,
    };
}
