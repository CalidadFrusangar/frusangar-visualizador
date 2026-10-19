# Frusangar · Visualizador de Pedidos (Navalcarnero)

Visualizador de pedidos de venta de Odoo para la línea de producción de **Navalcarnero** (tele grande en planta + móviles como PWA). Lo mantiene el responsable de calidad. Producción actual: https://frusangar-visualizador.onrender.com (Render, despliega desde `main`).

## Por qué existe la v2
En Odoo, una acción automatizada genera un texto de WhatsApp al validar pedido/albarán. Ese texto queda congelado y no refleja ampliaciones, reducciones, líneas quitadas ni cambios de fecha. La v2 hace que el visualizador sea el canal principal: muestra **Hoy + los 2 siguientes días laborables + «Próximos días»**, el **estado del albarán** y **avisos priorizados** de cambios (en pantalla y por Web Push). El usuario descartó WhatsApp Business y Telegram: los avisos van por la propia app (PWA).

## Forma de trabajar
- Siempre **primero en local**, luego desplegar.
- Se trabaja en la rama **`v2`**. No hacer push a `main` sin confirmación: Render despliega automáticamente desde `main`.
- Comunicación con el usuario en **español**.
- No modificar nada en Odoo: el backend solo lee (XML-RPC). Para probar cambios, usar **pedidos de prueba**, nunca de clientes reales.
- **Única escritura autorizada** (confirmada por el usuario el 15/10/2026): la nota interna «Visto en planta» en el chatter del `sale.order` al marcar un aviso (`odooNotes.js`, `ODOO_ACK_NOTES=true`). La firma el usuario de Odoo `botmake` («Bot MAKE 🤖», UID 23). Las notas de prueba deben ir marcadas «🧪 PRUEBA» (`server/test_ack_note.js <pedido>`).

## Arranque
- `npm start` (raíz) → `server/index.js` en http://localhost:3000, sirve también `client/dist`.
- `start_production.bat` → compila el cliente y arranca.
- Cliente: `cd client && npm run build` (o `npm run dev` en :3005 con proxy a :3000).
- Tests: `cd server && npm test` (node:test, `diff.test.js`).
- `server/.env` (no está en git): `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_PASSWORD`, `APP_PIN` (PIN de acceso; sin él la API queda bloqueada). Opcionales: `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `POLL_MS`, `NOTIFY_QUIET_MS`, `BOX_ALERT_MIN` (minutos tras validar para avisar de cajas sin declarar, 120 por defecto), `ODOO_ACK_NOTES` (`true` = nota en el chatter al marcar «Visto»), `EMPLOYEE_LOCATION_ID`, `DATA_DIR`, `ODOO_TIMEOUT_MS` (45000), `HOLIDAYS` (festivos `AAAA-MM-DD` separados por comas, se saltan como el domingo), `UPCOMING_DAYS` (7), `FINISHED_LOCATION_ID` (65 = «FRU/Ubicacion 4 (Productos terminados)»).
- `server/data/` (no está en git): `state.json` (instantáneas, eventos, suscripciones push) y `vapid.json` (claves generadas si no hay env). Borrar `state.json` = nueva línea base sin avisos.
- `server/inspect_today.js`: script de solo lectura que lista los pedidos por día con estado de albarán.

## Datos de Odoo (verificados)
- `sale.order.type_id`: **1 = Navalcarnero**, **5 = Mercamadrid Interno** (se produce en Navalcarnero). Mercamadrid como entorno propio queda fuera de alcance.
- Fecha de entrega = `commitment_date`, o `expected_date` si no hay commitment.
- **Días laborables**: Navalcarnero trabaja de lunes a sábado (domingo cerrado; confirmado 16/10/2026). Columnas = Hoy, 2 siguientes días laborables («Mañana»/«Pasado mañana» solo si lo son literalmente; si no, el día de la semana: el viernes se ve Hoy / Mañana / Lunes; el sábado, Hoy / Lunes / Martes) y «Próximos días» (7 días naturales más, agrupados por fecha). Cada columna llega hasta el inicio de la siguiente, así un pedido de domingo cae en la del sábado y nada se queda fuera. Hay pedidos con mucha antelación (Sodexo) y erratas de fecha (UNIDE con año 8122): el tope de «Próximos días» los deja fuera.
- **Almacén 4 (producto terminado)** = `stock.location` 65 «FRU/Ubicacion 4 (Productos terminados)». El stock (`stock.quant`) va en la unidad del producto, la misma que la línea de pedido. **Se fabrica** = el producto tiene lista de materiales (`mrp.bom`), todos «PATATAS TERMINADAS»; ABONO (servicio financiero) no cuenta.
- **Zona horaria**: Odoo guarda en UTC y muchos pedidos tienen `commitment_date` 22:00/23:00Z (= 00:00 Madrid). Los días se calculan siempre en `Europe/Madrid` (`server/dates.js`). La v1 tenía este bug.
- **Albarán validado** = `stock.picking` con `picking_type_code = 'outgoing'` en estado `done` (`FRU/FRUSAL/...`). Estados: validado / parcial / pendiente.
- Campos de línea usados: `product_uom_qty`, `product_packaging_qty` (= bultos), `product_packaging_id`, `palet_id`, `palet_qty`, `display_type`.

## Arquitectura (server/)
- `odoo.js`: cliente XML-RPC con `executeKw` y reautenticación.
- `fetchOrders.js`: pedidos de las 4 columnas (incl. cancelados), líneas y albaranes (leídos de 100 en 100) y stock del almacén 4 (`stock`: `byProduct` + `manufactured`). `odoo.js` corta cada llamada a los 45 s: xmlrpc no tiene timeout y una petición colgada bloqueaba el poller (pasó en Render el 16/10).
- `diff.js` (puro, con tests): instantáneas, detección de cambios y **prioridades**:
  - 🔴 crítico: cualquier cambio en pedido de **hoy** o con albarán **ya validado**; pedido nuevo o movido a hoy.
  - 🟠 alto: en **mañana**, reducciones, líneas eliminadas, cancelación, cambio de fecha.
  - 🔵 normal: ampliaciones y pedidos nuevos de mañana/pasado.
  - 🟢 info: albarán validado (sin push).
  - Aparte de la urgencia, los **pedidos nuevos** (`NUEVO_PEDIDO`) se pintan en **morado** con «🆕 Pedido nuevo» (tarjeta, panel, alerta a pantalla completa y título del push); los cambios mantienen los colores de urgencia. Estilos en `client/src/priority.js` (`NEW_ORDER_STYLE`, `eventStyle`).
- `poller.js`: cada 30 s; agrupa los cambios de un pedido hasta 60 s de calma (máx. 5 min) y compara la línea base con lo último, así las ediciones que se anulan no avisan. Ignora los pedidos que solo aparecen por avance de la ventana a medianoche.
- `store.js`: persistencia en JSON (interfaz pensada para cambiarla por una BD).
- `push.js`: Web Push (`web-push`, VAPID); cada suscripción tiene `minPriority`.
- `auth.js`: acceso con **PIN compartido** (`APP_PIN`). Cookie de sesión firmada httpOnly de 180 días por dispositivo; cambiar `APP_PIN` cierra todas las sesiones. 5 fallos por IP (o 30 en total) bloquean 15 min. Todo `/api` exige sesión salvo `/api/session` y `/api/login`. Sin CORS (mismo origen).
- `boxes.js`: estado de **declaración de cajas retornables** por albarán: se declara si sus lotes vienen de OF con cajas Euro Pool/IFCO (mismo criterio y catálogo que la app «Declarar cajas» de `Y:\Desarrollos\Agentes\PEDIR EN GO RAMP EUROPOOL`); lee `x_cajas_declaradas` / `x_cajas_declaracion` del albarán. Si un albarán con cajas sigue sin declarar `BOX_ALERT_MIN` después de validarse, el poller emite un aviso 🟠 alto (una vez por albarán, en `state.boxAlerts`).
- `offers.js`: **ofertas de las tarifas** (`product.pricelist.item`), sin precios (en planta no se enseñan; ADR-0017 en la base de conocimiento).
  - **Qué es oferta**: «Tipo de precio» = Oferta (`x_studio_tipo_de_precio`, de Studio, solo existe en producción; se comprueba con `fields_get`). Si está vacío, una regla con `date_end` o ventana de entrega (`x_studio_fecha_inicio_entrega` → `x_studio_fecha_final_entrega_1`), marcada «sin marcar». Las «Tarifa» no son oferta.
  - **Ventana**: manda la **ventana de PEDIDO** (validez de la regla, `date_start` / `date_end`). Es la fecha con la que Odoo pone el precio y factura (usuario, 2026-10-19). `date_end` son las 00:00 de Madrid del día siguiente al último, y Odoo compara `date_end >= fecha del pedido`.
    - La ventana de entrega (`deliveryStart` / `deliveryEnd`) solo informa y reparte el gasto de material.
    - Sin validez en la regla se usa la de entrega (`byOrder: false`).
  - **Estados**: en vigor, próximas (≤14 días) y terminadas (últimos 7 días). Avisa de fechas incoherentes (fin anterior al inicio).
  - **Clientes**: los de la tarifa, incluidos los de tarifas que derivan de ella (rappels: «RAPPEL ECOMORA 4,50%» → Ecomora).
  - **Marca en las líneas** (`tagOrders`): tarifa del pedido o su base, producto (plantilla) y **fecha del pedido** (`date_order`) dentro de la ventana de pedido.
  - **Lectura**: el poller las lee cada 5 min (`OFFERS_POLL_MS`) y por separado de los pedidos. Las instantáneas van en `state.offerSnapshots`.
  - **Avisos**: eventos `kind: 'oferta'` de prioridad normal (`OFERTA_NUEVA`, `OFERTA_CAMBIADA`, `OFERTA_EMPIEZA`), que van al panel y al push con el enlace `/?ofertas`. `OFERTA_TERMINADA` es info y no va al push.
  - **Rutas**: `/api/orders` devuelve `offers` y `line.offer` y hay una ruta `GET /api/offers`.
  - El mismo criterio está en el aviso de Odoo: `Y:\Desarrollos\13. Modulos personalizados odoo generales\aviso_precio_tarifa`.
- `offerMaterials.js`: **semáforo de material por oferta (ESTIMACIÓN)**. Responde a «¿alcanza el material que hay hasta el fin de la oferta?».
  - **Venta estimada**: la de las ofertas anteriores; si no hubo, la venta normal de 28 días × 2. Nunca menos de lo ya pedido.
  - **Lista de materiales**: la que nombra al cliente o a la tarifa; si no hay ninguna, la más usada.
  - **Material**: stock FRU + lo que viene en camino − gasto normal − lo que se llevará la oferta.
  - Se calcula cada 30 min (`OFFER_MATERIALS_MS`) en segundo plano y va en `offer.material` = `{ level: falta|justo|cubierto|sin_datos, text, method, estimate, ordered, uom, bultos, bultosFrom, kg }`.
  - **Bultos**: según cómo pide ese cliente (empaquetado de sus líneas de los últimos 90 días); si no hay, según la lista de materiales.
  - **Kg**: el «Peso» del producto, igual que `lineKg`.
  - El panel «Ofertas» los enseña como «📊 Venta estimada».
  - Es una versión **simplificada y copiada** del panel 9 (`Y:\Desarrollos\9. Indicadores productividad\core\ofertas.py`), que es el que decide qué pedir. Si cambia el criterio, cambiarlo en los dos (ADR-0018).
- `employees.js`: empleados de la planta = `hr.employee` con `work_location_id` = 1 (Navalcarnero, 22 el 15/10/2026; `EMPLOYEE_LOCATION_ID`), caché 10 min. «Visto» en avisos crítico/alto guarda `event.ack = { employeeId, name, at }` (el primero que lo marca); la alerta crítica se cierra en todas las pantallas.
- Rutas: `GET /api/orders`, `GET /api/events`, `GET /api/employees`, `POST /api/events/:id/ack`, `POST /api/events/archive` ({ ids, archived }: archivar/restaurar avisos en todos los equipos; marcar «Visto» también archiva), `GET /api/odoo/sale-order/:id` (redirige al formulario del pedido en Odoo), `/api/push/{public-key,subscribe,unsubscribe,test}`.

Cliente (`client/src`): `App.jsx` (entrada real), `DayColumn`, `OrderCard` (insignia de albarán, banner "Modificado", líneas antes→después y eliminadas), `ProductSummary` (vista «Productos» del día: bultos, cantidad y kg por producto y empaquetado, con total; kg = cantidad × «Peso» del producto en Odoo, calculado en `fetchOrders.js` como `line.kg`; al pasar el ratón por un producto sale una ficha con el reparto por pedido —bultos, %, cantidad, kg y estado del albarán— y al pulsar la fila se despliega debajo, para pantallas táctiles; columna «Fabricar»: lo pendiente menos el stock del almacén 4 que queda tras las columnas anteriores, repartido en `client/src/stock.js`; con 4 columnas la tabla va compacta), `Login` (PIN), `OffersPanel` (botón «Ofertas» de la cabecera y `?ofertas`; en `OrderCard` las líneas con oferta llevan «🏷 Oferta · se sirve del … al …», color fucsia `OFFER_STYLE` en `priority.js`), `ChangesPanel`, `CriticalAlert` (pantalla completa + sonido), `NotificationsButton`, `push.js`, `public/sw.js` + `manifest.webmanifest`. `?order=<id>` abre y resalta un pedido.

Lint: `motion` de framer-motion da falso positivo de `no-unused-vars` (ya pasaba en la v1).

## Pendientes
- **Ofertas (2026-10-19)**: hechas en `v2` y probadas en local contra producción (solo lectura: 5 ofertas, 25 líneas marcadas, panel y etiquetas vistos en el navegador). **Falta el visto bueno del usuario para pasarlo a `main`.**
- **v2 en producción desde el 15/10/2026** (`main` = `febc0b2`). Servicio Render `srv-d5rod2buibrs73cr9f00`. Render usa Node 24 (`engines` en `package.json`). El 16/10/2026 en Render solo había `APP_PIN`, `ODOO_*` y `VITE_API_URL`: faltaban las claves VAPID (cada despliegue generaba otras y los móviles dejaban de recibir push), `SESSION_SECRET` y `ODOO_ACK_NOTES`. Ese día se le dieron al usuario para añadirlas; confirmar con él cuáles puso. Rollback a la v1: commit `7d806d6`.
- Probar push en móvil en https://frusangar-visualizador.onrender.com (ya no hace falta ngrok). iPhone requiere "Añadir a pantalla de inicio".
- Antes de producción: el disco de Render free es efímero → decidir disco persistente o BD gratuita (Neon/Supabase) (las claves VAPID ya están en variables de entorno). Plan free: se duerme tras 15 min sin tráfico.
- Mejorar la acción automatizada de WhatsApp en Odoo (prompt para otro agente en `docs/prompt-agente-odoo.md`). No desactivar la acción antigua hasta validar la v2 en planta.
