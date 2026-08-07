# ApiScope — Frontend (Dashboard de monitoreo)

SPA de monitoreo (RF-03) construida con **React + JavaScript** (sin TypeScript,
a diferencia de `../backend/`) y **Vite**. Se compila a un unico archivo
`index.html` con todo el CSS/JS inline (`vite-plugin-singlefile`), que el
backend sirve tal cual en `GET /api/monitoring` — el consumidor final del
paquete `apiscope` nunca corre un build, solo recibe el HTML ya compilado.

## Por que React cumple RF-03

RF-03 lista explicitamente "Vanilla JS, Vue.js, React (embebido)" como
tecnologias sugeridas para la interface, y la seccion "Estructura
Componentizada" permite cualquier framework con componentes. El unico punto de
tension es "sin build process" + "todo en un solo HTML" — eso aplica al
**artefacto publicado**, no al desarrollo del paquete: el build corre aca, una
vez, y lo que se distribuye es el HTML resultante. No se usa CDN para ninguna
dependencia (ni Chart.js ni iconos): todo esta bundleado, lo cual ademas es
mas coherente con RF-01 ("no depende de servicios cloud externos") que tirar
de una CDN externa en runtime.

## Como se construyen los graficos

No se uso Chart.js ni ninguna libreria de graficos: los componentes de
`src/common/LineChart` y las barras de `src/dashboard/*` son SVG/HTML a mano,
siguiendo una paleta categorica + de severidad validada (contraste AA,
distinguible con daltonismo) y con animaciones de entrada. Esto mantiene el
bundle final chico (~200KB, contra el limite de 500KB de RF-03) y evita una
dependencia runtime externa.

## Estructura

Cada componente vive en su propia carpeta con su `.jsx` y su `.css` (RF-03,
"Estructura Componentizada"):

```
src/
  api/client.js            # fetch tipado hacia /metrics, /requests, /requests/:id
  auth/                    # AuthGate, LoginForm, useAuth (Basic Auth + sesion en localStorage)
  router/useHashRoute.js   # router minimo por hash (#/dashboard, #/requests, #/requests/:id)
  layout/                  # AppShell, NavBar
  dashboard/               # DashboardPage + cada card/grafico/tabla del dashboard
  requests/                # RequestsPage, FiltersBar, RequestsTable, CursorPagination
  detail/                  # RequestDetailPage, JsonViewer
  hooks/                   # useMetrics, useRequests, useRequestDetail, useRecentErrors
  common/                  # componentes reutilizables (Card, Badge, StatTile, LineChart, ...)
  styles/                  # tokens.css (paleta) + global.css (reset, animaciones, breakpoints)
```

## Auth (RF-03)

El backend ya implementa HTTP Basic Auth (`monitoring.auth`). El frontend no
sabe de antemano si esta habilitado: al montar, `useAuth` intenta
`GET /metrics` sin credenciales.

- Si responde 200 → sin auth, interface publica (`status: "anonymous"`, sin
  boton de logout).
- Si responde 401 → muestra `LoginForm`; al enviar, arma
  `Authorization: Basic base64(user:pass)`, lo guarda en `localStorage` junto
  a un timestamp de expiracion (default 1h, igual al default de
  `session_timeout_hours` en RF-06 — el backend no expone ese valor via API,
  asi que el frontend usa el mismo default documentado) y reintenta.
- Un timer revisa cada 30s si la sesion vencio para forzar logout aunque la
  pestaña siga abierta.

## Logs manuales en la lista de requests (RF-05)

`GET /api/monitoring/requests` historicamente devolvia solo
`RequestLogRecord` (asi nacio en la fase 4). RF-05 pide que los logs
manuales sean "consultables mediante filtros" y paginables "como los logs de
requests", asi que se agrego un filtro `type` opcional y aditivo al backend
(`request` default / `manual` / `all`) — el default no cambia, pero la pestaña
"Logs manuales" / "Todos" en `FiltersBar` ahora puede pedirlos. El detalle
(`GET /requests/:id`) tambien se extendio para servir ambos tipos.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo con HMR, contra un backend corriendo en :3000
                  # (proxear /api/monitoring manualmente o correr el backend en el mismo host)
npm run build     # compila a ../backend/dashboard/index.html (paso obligatorio antes de
                  # levantar el backend si se quiere ver el dashboard real)
```

Orden recomendado para probar todo el paquete de punta a punta:

```bash
cd frontend && npm install && npm run build
cd ../backend && pnpm install && pnpm run example
# abrir http://localhost:3000/api/monitoring
```
