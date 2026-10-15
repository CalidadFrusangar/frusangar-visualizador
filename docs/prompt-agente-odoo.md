# Prompt para el agente con acceso a Odoo: mejora de la acción automatizada de WhatsApp

```
Contexto
--------
Soy el responsable de calidad de Frusangar. En Odoo (fábrica de Navalcarnero: pedidos de venta
con type_id = 1 "Navalcarnero" y type_id = 5 "Mercamadrid Interno") tenemos una acción
automatizada. Al validar el pedido/albarán, esa acción genera un texto para WhatsApp con un
resumen de las líneas del pedido y un enlace al pedido en Odoo. Ese texto se pasa al grupo de
producción.

Problema: el texto se genera una sola vez y queda congelado. Cuando el comercial modifica el
pedido después (amplía cantidades, reduce, añade o quita líneas, cambia la fecha de entrega o lo
cancela), producción no se entera o trabaja con información desfasada.

En paralelo tenemos un visualizador web conectado a Odoo por XML-RPC
(https://frusangar-visualizador.onrender.com) que ya detecta estos cambios. Quiero que el texto
de WhatsApp siga la MISMA lógica y las MISMAS prioridades, para que ambos canales digan lo mismo.

PASO 1 — Auditoría (solo lectura, no cambies nada todavía)
-----------------------------------------------------------
1. Localiza la acción automatizada actual (base.automation / ir.actions.server) que genera el
   texto de WhatsApp. Dime:
   - el modelo y el disparador (on_create, on_write, al validar stock.picking...);
   - los filtros (dominio);
   - el código Python completo;
   - dónde se guarda el texto (campo, chatter, adjunto...) y cómo llega a WhatsApp (copiar y
     pegar, enlace wa.me, integración...).
2. Dime la versión exacta de Odoo y si es Odoo Online (SaaS) o self-hosted. Esto condiciona qué
   se puede hacer en safe_eval y si se pueden crear campos o botones con Studio.
3. Confirma que estos campos existen en sale.order.line: product_uom_qty,
   product_packaging_qty, product_packaging_id, palet_id, palet_qty y display_type.
Envíame este informe y espera mi confirmación antes de modificar nada.

PASO 2 — Mejora de la acción (después de mi OK; primero en una base de pruebas si existe)
-----------------------------------------------------------------------------------------
Objetivo: que el texto refleje siempre el estado actual del pedido y, si ya se había enviado
antes, que marque claramente QUÉ ha cambiado.

a) "Última versión enviada": guarda en el pedido una instantánea de lo que se comunicó a
   producción la última vez. Por ejemplo, un campo de texto x_whatsapp_snapshot con, por cada
   línea de producto, product_id, cantidad, bultos y unidad, además de la fecha de entrega y el
   estado. Ojo: en safe_eval puede no estar disponible `json`; usa un formato de texto simple
   que puedas parsear sin imports. Guarda también x_whatsapp_enviado_el (fecha y hora).

b) Disparadores: además del actual, cuando un pedido confirmado (state sale/done) de tipo 1 o 5
   cambie en algo de lo siguiente:
   - creación, modificación o borrado de líneas de pedido (ojo con el borrado: necesita su
     propio disparador o un cálculo desde el pedido);
   - commitment_date;
   - cancelación.
   En ese caso, regenera el texto como "ACTUALIZACIÓN" comparando con la instantánea:
     ➕ línea nueva: producto y bultos
     ➖ línea eliminada (tachada o con aviso claro)
     🔼 / 🔽 producto: antes → después (+/- diferencia), en bultos si cambian los bultos y en
        la unidad de venta si no
     📅 fecha cambiada: antes → después
     ❌ PEDIDO CANCELADO – NO PREPARAR
   Si dos líneas del mismo producto se borran y se recrean, cuéntalo como cambio de cantidad,
   no como "quitado y añadido".

c) Prioridad en la cabecera del mensaje (las mismas reglas que el visualizador):
   🔴 CRÍTICO: cualquier cambio en un pedido para HOY, o en un pedido cuyo albarán de salida
      (stock.picking con picking_type_code = 'outgoing') ya está en estado 'done'; también un
      pedido nuevo para hoy o uno que se mueve a hoy.
   🟠 IMPORTANTE: en pedidos para MAÑANA, reducciones, líneas eliminadas, cancelaciones y
      cambios de fecha.
   🔵 CAMBIO: el resto (ampliaciones y pedidos nuevos para mañana o pasado mañana).
   IMPORTANTE: "hoy" y "mañana" se calculan con la hora de Europa/Madrid. Odoo guarda las
   fechas en UTC y muchos pedidos tienen commitment_date a las 22:00 o 23:00 UTC (= 00:00 en
   Madrid). Si no conviertes la zona horaria, el pedido cae en el día equivocado.

d) Anti-ruido: los comerciales guardan varias veces seguidas. No generes un mensaje por cada
   guardado: actualiza el texto pendiente y deja que se envíe con el botón (punto e).
   Alternativa: una acción planificada (ir.cron) cada pocos minutos que agrupe los cambios.
   Propónme la opción más sencilla y robusta para nuestra versión.

e) Botones en el formulario del pedido de venta (Studio o vista heredada, lo que permita
   nuestra versión):
   - "📲 Texto WhatsApp": genera el texto (completo si nunca se envió, ACTUALIZACIÓN si ya se
     envió), lo muestra para copiar o lo abre con https://wa.me/?text=<texto codificado> y, al
     confirmarlo, actualiza la instantánea y x_whatsapp_enviado_el.
   - "📺 Ver en visualizador": abre
     https://frusangar-visualizador.onrender.com/?order=<id del pedido> en una pestaña nueva.
   - Un indicador visible (por ejemplo una cinta o etiqueta "Cambios sin comunicar") cuando el
     pedido haya cambiado después del último envío.

f) Pruebas: hazlas con un pedido de prueba (nunca con pedidos reales de clientes) y cubre:
   ampliar, reducir, borrar línea, añadir línea, cambiar fecha, cancelar, y modificar después
   de validar el albarán. Enséñame el texto generado en cada caso.

Restricciones
-------------
- No borres ni modifiques campos, acciones ni vistas existentes sin decirme antes qué vas a
  cambiar. Desactiva la acción antigua solo cuando la nueva esté probada.
- Nada que afecte a Mercamadrid (solo type_id 1 y 5).
- Documenta al final qué has creado: campos, acciones, vistas y botones, para poder revertirlo.
```

Nota: el botón "Ver en visualizador" con `?order=<id>` solo funciona cuando la v2 esté desplegada en Render.
