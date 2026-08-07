import { createDemoApp } from "./createApp";

/**
 * Levanta las 3 estrategias de storage a la vez, cada una en su propio
 * puerto dentro del mismo proceso node (PRD 6.5: "Demostracion de
 * estrategias: Las 3 estrategias de storage"). Si alguna falla al
 * arrancar (ej. postgres sin .env o sin `docker compose up -d`), se
 * avisa por consola y se sigue con el resto en vez de tirar todo el
 * proceso abajo.
 */
interface DemoTarget {
  name: string;
  configFile: string;
  port: number;
}

const TARGETS: DemoTarget[] = [
  { name: "memory", configFile: "logger.config.json", port: 3000 },
  { name: "sqlite", configFile: "logger.config.sqlite.json", port: 3001 },
  { name: "postgres", configFile: "logger.config.postgres.json", port: 3002 },
];

async function startTarget(target: DemoTarget): Promise<void> {
  const { app, apiscope } = await createDemoApp(target.configFile);

  app.listen(target.port, () => {
    console.log(
      `[${target.name}] escuchando en http://localhost:${target.port} ` +
        `(storage: ${apiscope.config.storage.strategy})`
    );
    console.log(
      `[${target.name}] monitor: http://localhost:${target.port}${apiscope.config.monitoring.endpoint}/metrics`
    );
  });
}

async function main(): Promise<void> {
  for (const target of TARGETS) {
    try {
      await startTarget(target);
    } catch (err) {
      console.error(
        `[${target.name}] no se pudo levantar, sigo con el resto: ` +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }
}

main();
