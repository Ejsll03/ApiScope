# Instalación

Este repositorio contiene el paquete en `backend/` y la SPA del panel en
`frontend/`. La instalación depende de si estás trabajando en este monorepo o
si vas a consumir el paquete ya publicado.

## Requisitos

- Node.js 18 o superior.
- pnpm 11 o superior.
- PostgreSQL solo si vas a usar la estrategia `postgresql`.

## Instalación local desde este repositorio

```bash
cd backend
pnpm install
```

Si quieres generar el panel embebido que sirve el backend:

```bash
cd ../frontend
npm install
npm run build
```

La compilación genera `backend/dashboard/index.html`, que es lo que sirve
`GET /api/monitoring`.

## Ejecutar la demo

```bash
cd backend
pnpm run example
```

O usa una variante específica:

```bash
pnpm run example:sqlite
pnpm run example:postgres
pnpm run example:all
```

## Uso como paquete del proyecto

Se publica en **GitHub Packages** (no en npmjs.com), que exige autenticación
incluso para instalar un paquete público. Antes del `npm install`, agregá a
`.npmrc` (del proyecto o `~/.npmrc` global):

```ini
@ejsll03:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=TU_TOKEN_AQUI
```

El token es un [Personal Access Token](https://github.com/settings/tokens)
de GitHub con permiso `read:packages`. Recién ahí:

```bash
npm install @ejsll03/apiscope
```

```ts
import express from "express";
import { ApiScope } from "@ejsll03/apiscope";

const app = express();
const apiscope = new ApiScope();

await apiscope.init();
app.use(express.json());
app.use(apiscope.middleware());
app.use(apiscope.config.monitoring.endpoint, apiscope.monitoringRouter());
```

## Archivos de configuración

- `backend/examples/express-basic/logger.config.json`: memoria.
- `backend/examples/express-basic/logger.config.sqlite.json`: SQLite.
- `backend/examples/express-basic/logger.config.postgres.json`: PostgreSQL.
- `backend/.env.example`: variables de ejemplo para credenciales sensibles.

## Recomendación operativa

Si usas PostgreSQL o auth en el monitor, copia `backend/.env.example` a
`backend/.env` y completa los valores reales antes de arrancar la app.