# Registro de cambios

Acá vamos anotando los cambios importantes del proyecto. El formato sigue Keep
a Changelog y el versionado sigue SemVer.

## [Unreleased]

### Añadido

- Documentación raíz para instalación, configuración, arquitectura, API,
  pruebas y migración.
- Panel de monitoreo (`frontend/`): dashboard, lista de requests con filtros
  y paginación por cursor, vista de detalle, autenticación HTTP Basic.
- Tema visual del panel con tipografía Inter, paleta dark mode ajustada y
  tokens de duración/easing compartidos (`--duration-fast/base/slow`).
- Soporte de `prefers-reduced-motion` en el panel de monitoreo.

### Cambiado

- Se ajustó la documentación raíz para que refleje el estado actual del
    repositorio.

### Corregido

- `logInfo()`/`logWarning()`/`logError()`/`logDebug()` ahora enmascaran los
  campos sensibles de `metadata` (misma lista `capture.sensitive_body_fields`
  que ya aplicaba al request/response body) -- antes se guardaban en texto
  plano si el llamador pasaba datos de un body ahí.
- `.gitignore` de la raíz: el patrón para ignorar el build del dashboard
  (`backend/dashboard/`) estaba sin anclar y también ocultaba
  `frontend/src/dashboard/`, impidiendo que ese código fuente se commiteara.
- El gráfico de línea del dashboard (Timeline/Performance) ya no repite su
  animación de trazado completo en cada auto-refresh, solo al montar.
- La barra de las tablas rankeadas del dashboard anima `transform` en vez de
  `width`, evitando layout thrashing en cada refresh.
- Con `monitoring.auth.enabled = true`, `GET /api/monitoring` (el HTML de la
  SPA) ya no exige Basic Auth nativo -- antes el navegador disparaba su
  propio diálogo de credenciales antes de que la app cargara, y el
  `LoginForm` custom nunca llegaba a mostrarse.
- El header `WWW-Authenticate` de un `401` de monitoreo ya no se envía a
  clientes que mandan `Sec-Fetch-Mode` (navegadores, `fetch` de Node) --
  evita que el navegador intercepte la respuesta y cuelgue el `fetch()` de
  la SPA esperando su propio diálogo nativo. Clientes API (curl, Postman)
  siguen recibiendo el desafío RFC 7235 completo.

## [0.1.0]

### Añadido

- Punto de entrada central `ApiScope` para Express.
- Middleware automático de captura de request y response.
- API de logging manual con niveles info, warning, error y debug.
- Estrategias de almacenamiento en memoria, SQLite y PostgreSQL.
- Endpoints de monitoreo con paginación por cursor para métricas y requests.
- Panel embebido servido desde `/api/monitoring`.
- Cargador de configuración JSON con sustitución de variables de entorno.

### Cambiado

- Las respuestas de monitoreo usan un contrato HTTP estable en snake_case.

### Corregido

- Los campos del payload de request y response se almacenan por separado.

## Historial sin fechación confirmada

No se anotan fechas de versiones anteriores porque todavía no están confirmadas
por tags o releases del repositorio.