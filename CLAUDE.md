# Frusangar · Visualizador de Pedidos (Navalcarnero)

Visualizador de pedidos de venta de Odoo para la línea de producción de **Navalcarnero** (tele grande en planta + móviles como PWA). Lo mantiene el responsable de calidad. Producción actual: https://frusangar-visualizador.onrender.com (Render, despliega desde `main`).

## Por qué existe la v2
En Odoo, una acción automatizada genera un texto de WhatsApp al validar pedido/albarán. Ese texto queda congelado y no refleja ampliaciones, reducciones, líneas quitadas ni cambios de fecha. La v2 hace que el visualizador sea el canal principal: muestra **Hoy / Mañana / Pasado**, el **estado del albarán** y **avisos priorizados** de cambios (en pantalla y por Web Push). El usuario descartó WhatsApp Business y Telegram: los avisos van por la propia app (PWA).

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
- `server/.env` (no está en git): `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_PASSWORD`, `APP_PIN` (PIN de acceso; sin él la API queda bloqueada). Opcionales: `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `POLL_MS`, `NOTIFY_QUIET_MS`, `BOX_ALERT_MIN` (minutos tras validar para avisar de cajas sin declarar, 120 por defecto), `ODOO_ACK_NOTES` (`true` = nota en el chatter al marcar «Visto»), `EMPLOYEE_LOCATION_ID`, `DATA_DIR`.
- `server/data/` (no está en git): `state.json` (instantáneas, eventos, suscripciones push) y `vapid.json` (claves generadas si no hay env). Borrar `state.json` = nueva línea base sin avisos.
- `server/inspect_today.js`: script de solo lectura que lista los pedidos por día con estado de albarán.

## Datos de Odoo (verificados)
- `sale.order.type_id`: **1 = Navalcarnero**, **5 = Mercamadrid Interno** (se produce en Navalcarnero). Mercamadrid como entorno propio queda fuera de alcance.
- Fecha de entrega = `commitment_date`, o `expected_date` si no hay commitment.
- **Zona horaria**: Odoo guarda en UTC y muchos pedidos tienen `commitment_date` 22:00/23:00Z (= 00:00 Madrid). Los días se calculan siempre en `Europe/Madrid` (`server/dates.js`). La v1 tenía este bug.
- **Albarán validado** = `stock.picking` con `picking_type_code = 'outgoing'` en estado `done` (`FRU/FRUSAL/...`). Estados: validado / parcial / pendiente.
- Campos de línea usados: `product_uom_qty`, `product_packaging_qty` (= bultos), `product_packaging_id`, `palet_id`, `palet_qty`, `display_type`.

## Arquitectura (server/)
- `odoo.js`: cliente XML-RPC con `executeKw` y reautenticación.
- `fetchOrders.js`: pedidos de hoy..pasado (incl. cancelados), líneas y albaranes.
- `diff.js` (puro, con tests): instantáneas, detección de cambios y **prioridades**:
  - 🔴 crítico: cualquier cambio en pedido de **hoy** o con albarán **ya validado**; pedido nuevo o movido a hoy.
  - 🟠 alto: en **mañana**, reducciones, líneas eliminadas, cancelación, cambio de fecha.
  - 🔵 normal: ampliaciones y pedidos nuevos de mañana/pasado.
  - 🟢 info: albarán validado (sin push).
- `poller.js`: cada 30 s; agrupa los cambios de un pedido hasta 60 s de calma (máx. 5 min) y compara la línea base con lo último, así las ediciones que se anulan no avisan. Ignora los pedidos que solo aparecen por avance de la ventana a medianoche.
- `store.js`: persistencia en JSON (interfaz pensada para cambiarla por una BD).
- `push.js`: Web Push (`web-push`, VAPID); cada suscripción tiene `minPriority`.
- `auth.js`: acceso con **PIN compartido** (`APP_PIN`). Cookie de sesión firmada httpOnly de 180 días por dispositivo; cambiar `APP_PIN` cierra todas las sesiones. 5 fallos por IP (o 30 en total) bloquean 15 min. Todo `/api` exige sesión salvo `/api/session` y `/api/login`. Sin CORS (mismo origen).
- `boxes.js`: estado de **declaración de cajas retornables** por albarán: se declara si sus lotes vienen de OF con cajas Euro Pool/IFCO (mismo criterio y catálogo que la app «Declarar cajas» de `Y:\Desarrollos\Agentes\PEDIR EN GO RAMP EUROPOOL`); lee `x_cajas_declaradas` / `x_cajas_declaracion` del albarán. Si un albarán con cajas sigue sin declarar `BOX_ALERT_MIN` después de validarse, el poller emite un aviso 🟠 alto (una vez por albarán, en `state.boxAlerts`).
- `employees.js`: empleados de la planta = `hr.employee` con `work_location_id` = 1 (Navalcarnero, 22 el 15/10/2026; `EMPLOYEE_LOCATION_ID`), caché 10 min. «Visto» en avisos crítico/alto guarda `event.ack = { employeeId, name, at }` (el primero que lo marca); la alerta crítica se cierra en todas las pantallas.
- Rutas: `GET /api/orders`, `GET /api/events`, `GET /api/employees`, `POST /api/events/:id/ack`, `POST /api/events/archive` ({ ids, archived }: archivar/restaurar avisos en todos los equipos; marcar «Visto» también archiva), `GET /api/odoo/sale-order/:id` (redirige al formulario del pedido en Odoo), `/api/push/{public-key,subscribe,unsubscribe,test}`.

Cliente (`client/src`): `App.jsx` (entrada real), `DayColumn`, `OrderCard` (insignia de albarán, banner "Modificado", líneas antes→después y eliminadas), `ProductSummary` (vista «Productos» del día: bultos, cantidad y kg por producto y empaquetado, con total; kg = cantidad × «Peso» del producto en Odoo, calculado en `fetchOrders.js` como `line.kg`), `Login` (PIN), `ChangesPanel`, `CriticalAlert` (pantalla completa + sonido), `NotificationsButton`, `push.js`, `public/sw.js` + `manifest.webmanifest`. `?order=<id>` abre y resalta un pedido.

Lint: `motion` de framer-motion da falso positivo de `no-unused-vars` (ya pasaba en la v1).

## Pendientes
- **v2 en producción desde el 15/10/2026** (`main` = `febc0b2`). Servicio Render `srv-d5rod2buibrs73cr9f00`. En Render están puestas `APP_PIN`, `VAPID_*`, `SESSION_SECRET` y `ODOO_ACK_NOTES=true`. Rollback a la v1: commit `7d806d6`.
- Probar push en móvil en https://frusangar-visualizador.onrender.com (ya no hace falta ngrok). iPhone requiere "Añadir a pantalla de inicio".
- Antes de producción: el disco de Render free es efímero → decidir disco persistente o BD gratuita (Neon/Supabase) (las claves VAPID ya están en variables de entorno). Plan free: se duerme tras 15 min sin tráfico.
- Mejorar la acción automatizada de WhatsApp en Odoo (prompt para otro agente en `docs/prompt-agente-odoo.md`). No desactivar la acción antigua hasta validar la v2 en planta.
