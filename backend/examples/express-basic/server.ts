import path from "node:path";
import express from "express";
import { ApiScope } from "../../src";

async function main(): Promise<void> {
  // pnpm run example              -> logger.config.json (memoria, default)
  // pnpm run example:postgres     -> logger.config.postgres.json (requiere .env con LOGGER_DB_*)
  const configFile = process.argv[2] ?? "logger.config.json";
  const apiscope = new ApiScope({
    configPath: path.join(__dirname, configFile),
    envPath: path.resolve(__dirname, "../../.env"),
  });
  await apiscope.init();

  const app = express();
  app.use(express.json());
  app.use(apiscope.middleware());
  app.use(apiscope.config.monitoring.endpoint, apiscope.monitoringRouter());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/users", (req, res) => {
    apiscope.logInfo("Creando usuario", { body: req.body });
    res.status(201).json({ id: 1, ...req.body });
  });

  app.get("/boom", (_req, res) => {
    apiscope.logError("Algo salio mal en /boom", new Error("boom de prueba"));
    res.status(500).json({ error: "internal error" });
  });

  // Ruta que lanza un error de verdad, capturado por el error-handler de abajo.
  app.get("/crash", () => {
    throw new Error("crash real para probar captura automatica de errores");
  });

  app.get("/logs", async (_req, res) => {
    const page = await apiscope.storage.getRecords({ limit: 20 });
    res.json(page);
  });

  // Guardando el error en res.locals.apiScopeError, el middleware de
  // ApiScope lo recoge automaticamente para errorMessage/stackTrace (RF-02).
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.locals.apiScopeError = err;
    res.status(500).json({ error: err.message });
  });

  const port = 3000;
  app.listen(port, () => {
    console.log(`ApiScope demo escuchando en http://localhost:${port}`);
    console.log(
      "Prueba: GET /health | POST /users | GET /boom | GET /crash | GET /logs"
    );
    console.log(
      `Monitor: GET ${apiscope.config.monitoring.endpoint}/metrics | ` +
        `GET ${apiscope.config.monitoring.endpoint}/requests | ` +
        `GET ${apiscope.config.monitoring.endpoint}/requests/:id`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
