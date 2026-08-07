# @ejsll03/apiscope

Logging y monitoreo autoalojado para REST APIs en Express: middleware de
captura automática de requests/responses, logging manual, tres estrategias
de almacenamiento (memoria, SQLite, PostgreSQL) y un dashboard de
monitoreo embebido, sin depender de ningún servicio cloud externo.

## Instalación

Este paquete se publica en **GitHub Packages**, no en el registro público de
npmjs.com. GitHub Packages exige autenticación incluso para instalar un
paquete público, así que hacen falta dos pasos antes del `npm install`:

1. Generá un [Personal Access Token](https://github.com/settings/tokens) de
   GitHub con permiso `read:packages` (alcanza con eso para instalar).
2. En tu proyecto (o en `~/.npmrc` global), agregá:

   ```ini
   @ejsll03:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=TU_TOKEN_AQUI
   ```

Recién ahí:

```bash
npm install @ejsll03/apiscope
```

## Uso

```ts
import express from "express";
import { ApiScope } from "@ejsll03/apiscope";

const app = express();
const apiscope = new ApiScope(); // lee logger.config.json + .env

await apiscope.init();

app.use(express.json());
app.use(apiscope.middleware());
app.use(apiscope.config.monitoring.endpoint, apiscope.monitoringRouter());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(3000, () => {
  console.log(`Dashboard en http://localhost:3000${apiscope.config.monitoring.endpoint}`);
});
```

Logging manual, en cualquier parte del código:

```ts
apiscope.logInfo("Usuario creado", { userId: user.id });
apiscope.logError("Fallo el pago", error, { orderId: order.id });
```

Los campos configurados como sensibles (`password`, `token`, etc.) se
enmascaran automáticamente tanto en la captura de requests como en el
logging manual.

## Configuración

Un archivo `logger.config.json` en la raíz del proyecto controla storage,
captura, monitoreo y retención. Ejemplo mínimo (memoria, sin auth):

```json
{
  "storage": { "strategy": "memory" },
  "monitoring": { "auth": { "enabled": false } }
}
```

Ver la [guía completa de configuración](https://github.com/Ejsll03/ApiScope/blob/Dev/CONFIGURATION.md)
para SQLite, PostgreSQL, captura, retención y variables de entorno.

## Documentación

- [Instalación](https://github.com/Ejsll03/ApiScope/blob/Dev/INSTALLATION.md)
- [Configuración](https://github.com/Ejsll03/ApiScope/blob/Dev/CONFIGURATION.md)
- [Arquitectura](https://github.com/Ejsll03/ApiScope/blob/Dev/ARCHITECTURE.md)
- [API del dashboard](https://github.com/Ejsll03/ApiScope/blob/Dev/API.md)
- [Registro de cambios](https://github.com/Ejsll03/ApiScope/blob/Dev/CHANGELOG.md)

## Licencia

MIT
