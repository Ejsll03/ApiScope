import { createDemoApp } from "./createApp";

async function main(): Promise<void> {
  // pnpm run example              -> logger.config.json (memoria, default)
  // pnpm run example:sqlite       -> logger.config.sqlite.json
  // pnpm run example:postgres     -> logger.config.postgres.json (requiere .env con LOGGER_DB_*)
  // pnpm run example:all          -> las 3 estrategias a la vez, ver run-all.ts
  const configFile = process.argv[2] ?? "logger.config.json";
  const { app, apiscope } = await createDemoApp(configFile);

  const port = Number(process.env.PORT) || 3000;
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
