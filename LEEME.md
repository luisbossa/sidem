# SIDEM — Inspección de Sistemas Electromecánicos

Aplicación web del Servicio de Ingeniería y Mantenimiento (CCSS · Área de Salud Naranjo) para los
recorridos diarios de la Casa de Máquinas. Servidor **Node.js + Express** con arquitectura **MVC** y vistas **EJS** (express-ejs-layouts),
base de datos **SQLite** y front-end en CSS y módulos ES (sin frameworks).

## Requisitos

- **Node.js 22.13 o superior** (probado con Node 24). SQLite viene incluido en Node (`node:sqlite`):
  no hay que instalar ni compilar nada adicional.

## Puesta en marcha

```bash
npm install        # instala Express, EJS y express-ejs-layouts
npm start          # inicia el servidor en http://localhost:3000
npm run dev        # igual, pero se reinicia solo al cambiar archivos del servidor
npm test           # pruebas de la API (usa una base en memoria; no toca los datos reales)
npm run respaldo   # copia de seguridad de la base de datos
```

La primera vez se crea `data/sidem.db` con sus tablas y los usuarios iniciales
(`ingeniero`, `rsalas`, `cmurillo`, `ebolanos`, todos con contraseña `123`).
**Cambie esas contraseñas** desde *Gestión de usuarios* antes de usar el sistema en producción.

### Variables de entorno (opcionales)

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `SIDEM_DB` | `data/sidem.db` | Ruta del archivo SQLite |
| `SIDEM_SESION_HORAS` | `12` | Duración de la sesión |
| `SIDEM_COOKIE_SEGURA` | — | Poner `1` si el sistema se sirve por HTTPS |

### Respaldo

Toda la información está en `data/sidem.db`. Para respaldarla ejecute `npm run respaldo`
(funciona con el servidor encendido): crea una copia en `data/respaldos/sidem-AAAAMMDD-HHMMSS.db`.
Para restaurar, detenga el servidor y reemplace `data/sidem.db` por la copia.

## Arquitectura MVC

El servidor sigue el patrón **Modelo – Vista – Controlador**:

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| **Modelo** | `server/models/` | Clases con el SQL de cada entidad (`Usuarios`, `Sesiones`, `SemanasRol`, `Inspecciones`, `Cancelaciones`, `RecorridosEnCurso`). Solo hablan con SQLite. |
| **Vista** | `server/views/` | Plantillas **EJS** con layouts (**express-ejs-layouts**): `layouts/auth` (login y errores) y `layouts/app` (barra lateral, barra superior y modales). Las páginas incluyen *partials* por sección. |
| **Controlador** | `server/controllers/` | Reciben la petición, validan los datos, aplican permisos y reglas, usan los modelos y responden JSON (API) o renderizan una vista (páginas). |
| Rutas | `server/routes/` | `web.js` (páginas) y `api.js` (API REST): solo asocian cada URL con su middleware y su controlador. |
| Middleware | `server/middleware/` | Sesión (`cargarSesion`, `requiereSesion`, `requiereRol`, `requiereSesionPagina`), cabeceras de seguridad y manejo de errores. |

Flujo de una petición: **ruta → middleware → controlador → modelo → (vista EJS o JSON)**.

Los modelos se crean una vez sobre la conexión (`crearModelos(db)`) y se inyectan en los controladores
(`crearControladorUsuarios(modelos)`), lo que permite probar la app con una base en memoria.

### Páginas

| URL | Vista | Layout |
|---|---|---|
| `/` | redirige a `/app` o `/login` según la sesión | — |
| `/login` | `pages/login.ejs` | `layouts/auth` |
| `/app` | `pages/app.ejs` (requiere sesión) | `layouts/app` |
| cualquier otra | `pages/error.ejs` (404) | `layouts/auth` |

`/app` se renderiza según el rol: el menú y las secciones del técnico o del ingeniero, con el nombre,
las iniciales, el rol y la fecha ya en el HTML. Los iconos SVG se generan en el servidor con el mismo
`public/js/ui/icons.js` que usa el navegador (`<%- icono('salir') %>`). Las direcciones antiguas
`/pages/login.html` y `/pages/app.html` redirigen a las nuevas.

## Estructura

```
package.json
server/
  index.js                  Arranque: abre la base y escucha en el puerto
  app.js                    Aplicación Express: EJS + layouts, middleware, rutas y archivos estáticos
  config.js                 Configuración (variables de entorno)
  models/                   MODELOS
    index.js                crearModelos(db)
    user.js                 Usuarios
    session.js              Sesiones
    schedule-week.js        SemanasRol
    inspection.js           Inspecciones (con valores, sistemas y conversación)
    cancellation.js         Cancelaciones
    route-draft.js          RecorridosEnCurso
  views/                    VISTAS (EJS)
    layouts/                auth.ejs, app.ejs
    pages/                  login.ejs, app.ejs, error.ejs
    partials/
      head.ejs, dialog.ejs
      login/                brand-panel, gauge, schematic
      app/                  sidebar, topbar
        sections/           home, technician-reports, schedule, inspection, dashboard, history, users
        modals/             report-detail, dashboard-detail, user-form, schedule-form
  controllers/              CONTROLADORES
    pages.js                Páginas (renderiza las vistas)
    auth.js, data.js, users.js, schedule.js, inspections.js, cancellations.js, route-drafts.js
  routes/
    web.js                  Rutas de páginas
    api.js                  Rutas de la API
  middleware/               auth, security-headers, error-handler
  services/
    inspection-report.js    Valida el informe con el catálogo de sistemas y calcula el resultado
  security/                 passwords (scrypt), sessions (token y cookie), login-attempts (bloqueo)
  db/                       schema.sql, connection.js, seed.js
  utils/                    errors (ErrorHttp), validation, dates
  tools/backup.js           Copia de respaldo (npm run respaldo)
public/                     Archivos estáticos del navegador
  favicon.svg
  css/                      login.css, main.css y sus partes (base, components, views)
  js/
    login.js / main.js      Entradas de cada página
    core/                   paths, state, dom, format
    data/
      systems.js            Catálogo de los 13 sistemas y sus campos (lo usan el navegador y el servidor)
      storage.js            Único acceso a datos: llama a la API y mantiene una caché en memoria
    ui/                     actions, dialogs, navigation, icons (también los usa el servidor)
    features/               login, session, inspection, technician-reports, history, schedule, users,
                            report-detail, dashboard/
tests/
  api.test.js               Pruebas de la API y de las vistas (node:test)
data/                       Base SQLite (se crea al arrancar; no se versiona)
```
## Base de datos

| Tabla | Contenido |
|---|---|
| `usuarios` | Personal con acceso: rol (`inspector` / `ingeniero`), usuario, hash de contraseña, turno, estado |
| `sesiones` | Sesiones abiertas (hash SHA-256 del token y vencimiento) |
| `semanas_rol` | Rol semanal: técnico asignado (`tecnico_id`) por semana |
| `inspecciones` | Informe de cada recorrido: técnico, mañana/tarde, horas, resultado y estado de revisión. Un recorrido de mañana y uno de tarde por técnico y día |
| `inspeccion_valores` | Lectura (`valor`) o verificación (`Conforme` / `No conforme` / `No aplica` + `detalle`) de cada campo |
| `inspeccion_sistemas` | Orden en que se recorrió cada sistema y justificación de los no completados |
| `inspeccion_mensajes` | Conversación: observaciones del ingeniero y respuestas del técnico |
| `cancelaciones` | Recorridos cancelados con su justificación |
| `recorridos_en_curso` | Borrador del recorrido en curso de cada técnico (se restaura al recargar o cambiar de equipo) |

Los usuarios no se borran: se marcan como *Inactivo / Vacaciones* para conservar su historial.

## API

Todas las rutas responden JSON; los errores tienen la forma `{ "error": "mensaje", "titulo": "…" }`.

| Método y ruta | Quién | Uso |
|---|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/sesion` | todos | Sesión |
| `GET /api/datos` | con sesión | Todo lo que la app necesita al cargar, según el rol |
| `GET/POST /api/usuarios` · `PUT /api/usuarios/:id` | ingeniero | Gestión de usuarios |
| `GET /api/cronograma` | con sesión | Rol semanal |
| `POST /api/cronograma` · `PUT/DELETE /api/cronograma/:id` | ingeniero | Programar, editar y eliminar semanas |
| `GET /api/inspecciones` · `GET /api/inspecciones/:id` | con sesión | El ingeniero ve todos; el técnico, solo los suyos |
| `POST /api/inspecciones` | técnico | Enviar informe (el servidor valida y calcula el resultado) |
| `PUT /api/inspecciones/:id/revision` | ingeniero | Aprobar o devolver con observaciones |
| `POST /api/inspecciones/:id/respuesta` | técnico autor | Responder una devolución |
| `GET/POST /api/cancelaciones` | con sesión / técnico | Recorridos cancelados |
| `GET/PUT/DELETE /api/progreso` | técnico | Borrador del recorrido en curso |

## Seguridad

- Contraseñas con **scrypt** y sal aleatoria; nunca se envían al navegador.
- Sesión en cookie `httpOnly`, `SameSite=Strict`; en la base solo se guarda el hash del token.
- Permisos verificados en el servidor en cada ruta (el menú por rol del navegador es solo visual).
- Bloqueo temporal tras 5 intentos fallidos de inicio de sesión; mismo mensaje para usuario
  inexistente o contraseña incorrecta.
- Al desactivar un usuario o cambiar su contraseña o rol se cierran sus sesiones.
- El servidor valida cada informe con `public/js/data/systems.js`: sistemas completos o justificados,
  detalle obligatorio en las no conformidades, y calcula duración y resultado.
- Cabeceras de seguridad (CSP, `X-Frame-Options`, `nosniff`).

## Front-end

### Criterios visuales

- Superficies blancas con bordes de 1px (`--border`), radios pequeños (6–12px) y sombras sutiles.
- Un solo color de acento: azul institucional (`--primary`). Verde, ámbar y rojo solo comunican estado.
- Pesos de letra entre 400 y 700; sin degradados, brillos ni animaciones decorativas.
- El color de cada sistema se usa como acento (barra lateral e icono), nunca como fondo.
- El contenido usa todo el ancho disponible (hasta `--content-max`, 1680px).
- Campos (`components/forms.css`): selects con flecha propia, unidades como sufijo (`.input-group` + `.input-addon`)
  y verificaciones como botones de opción (`.choice-group`) sin preselección: el técnico debe elegir cada una.
  En teléfono los campos usan 16px para evitar el zoom automático de iOS.

### Iconos

No se usan emoticones: todos los iconos son SVG de línea definidos en `js/ui/icons.js`.

- En JS: `icono('calendario')` devuelve el `<svg>` para insertar con `innerHTML`.
- En HTML: `<span data-icon="calendario"></span>`; `pintarIconos()` (en `main.js`) lo completa al cargar.
- Cada sistema de `data/systems.js` indica su icono por nombre (`icono: 'llama'`).
- Para agregar uno nuevo, añada su trazo en `TRAZOS` dentro de `icons.js`.

### Datos en el navegador

`js/data/storage.js` es el único módulo que habla con el servidor:

- `sincronizar()` carga `/api/datos` en una caché en memoria; las lecturas (`leerRegistros()`, `leerCronograma()`…)
  son síncronas desde esa caché.
- Las escrituras (`crearInspeccion()`, `revisarInspeccion()`, `guardarUsuario()`, `guardarSemana()`…) son asíncronas:
  esperan la respuesta del servidor y actualizan la caché. Si el servidor rechaza la operación, lanzan `ErrorApi`
  con un mensaje listo para mostrar.
- Al cambiar de vista se muestra la caché y se recargan los datos en segundo plano para ver los cambios de otros usuarios.
- El recorrido en curso se guarda en el servidor (con una espera breve para agrupar cambios).

### Convenciones

- **Clases CSS**: en inglés, palabras separadas con guion (`btn-green`, `route-system`, `summary-item`). Sin BEM ni guion bajo.
- **Responsive**: mobile-first con `min-width` en 480 / 768 / 1024 px. Cada `@media` vive junto al componente o vista que afecta.
- **Eventos**: el HTML usa atributos `data-*` en lugar de `onclick`:
  - `data-action="nombre"` → clic (y Enter/Espacio en `role="button"`)
  - `data-change="nombre"` → cambio en select/input
  - `data-submit="nombre"` → envío de formulario
  - `data-backdrop-action="nombre"` → clic sobre el fondo de un modal
  - Los parámetros van en otros `data-*` (`data-id`, `data-view`, …). Cada nombre se registra en `js/main.js`.
- **Estado**: las variables compartidas viven en `js/core/state.js` (`estado.usuarioSesion`, `estado.respuestas`, …).
- Funciones e identificadores en español (`iniciarSesion`, `verDetalle`, `renderHistorial`, …); archivos y clases CSS en inglés.

## Cómo seguir el flujo

1. `/login`: `iniciarSesion()` (`features/login.js`) envía las credenciales a `/api/auth/login`; el servidor abre la sesión.
2. `/app` (vista EJS según el rol): `restaurarProgreso()` llama `sincronizar()`, muestra el menú del rol y restaura un recorrido pendiente.
3. `iniciarInspeccion()` crea el recorrido; `mostrarListadoSistemas()` permite escoger el orden.
4. `abrirSistema()` presenta las preguntas definidas en `data/systems.js`.
5. `guardarSistemaCompletado()` conserva las respuestas; `finalizarInspeccion()` envía el informe a `POST /api/inspecciones`.
6. El ingeniero consulta `renderDashboardIngenieria()` y `renderHistorial()`; `guardarRevisionIngeniero()` registra su decisión.
