# ApiScope

ApiScope es un paquete autoalojado de logging y monitoreo para REST APIs.
Captura requests y responses mediante middleware, guarda logs en memoria,
SQLite o PostgreSQL, y expone una interfaz web para explorar métricas y
requests.

## Qué incluye este repositorio

- `backend/`: el paquete Node.js + TypeScript del repositorio, publicado como `@ejsll03/apiscope`.
- `frontend/`: la SPA embebida que genera el panel de monitoreo.
- `requerimientos-logger.md`: la especificación funcional del proyecto.
- `CHANGELOG.md`, `MIGRATION.md`, `CONFIGURATION.md`, `ARCHITECTURE.md`,
  `API.md`, `TESTING.md` e `INSTALLATION.md`: la documentación operativa.

## Estado actual

- Versión de desarrollo: `0.1.0`.
- Framework soportado hoy: Express.
- Estrategias de almacenamiento implementadas: memoria, SQLite y PostgreSQL.
- API pública principal: `ApiScope`, `middleware()`, `monitoringRouter()`,
  `logInfo()`, `logWarning()`, `logError()`, `logDebug()`.

## Inicio rápido

```bash
cd backend
pnpm install
pnpm run example
```

Luego abre `http://localhost:3000/api/monitoring`.

Para cambiar de estrategia de almacenamiento:

```bash
cd backend
pnpm run example:sqlite
pnpm run example:postgres
pnpm run example:all
```

## Demo en vivo

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Ejsll03/ApiScope)

`render.yaml` en la raíz describe el servicio (build del frontend + backend,
storage en memoria, sin auth) para un deploy con un clic en
[Render](https://render.com). El plan gratuito duerme tras 15 min de
inactividad y tarda unos segundos en despertar en el próximo request.

## Documentación

- [Instalación](INSTALLATION.md)
- [Configuración](CONFIGURATION.md)
- [Arquitectura](ARCHITECTURE.md)
- [API](API.md)
- [Pruebas](TESTING.md)
- [Guía de migración](MIGRATION.md)
- [Registro de cambios](CHANGELOG.md)

## Ejemplos

El ejemplo funcional principal vive en `backend/examples/express-basic/`.
Incluye rutas para probar captura, logging manual, errores y monitoreo.

## Paquete

El código distribuible vive en `backend/`. Desde ahí puedes desarrollar,
ejecutar pruebas y generar el artefacto del paquete.

