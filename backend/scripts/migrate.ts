import { Pool } from "pg";
import { loadConfig } from "../src/config/loadConfig";
import { runMigrations, validateConnection } from "../src/migrations/runMigrations";
import { buildPoolConfig } from "../src/storage/PostgresStorage";

/**
 * Comando CLI para correr las migrations de PostgreSQL a mano (RF-04.3:
 * "Comando CLI: Comando para ejecutar migrations manualmente"), sin
 * depender de `storage.config.auto_migrate`. Pensado para produccion,
 * donde aplicar el schema suele ser un paso deliberado antes de levantar
 * la app, no algo que corra solo en cada arranque.
 *
 * Uso:
 *   pnpm run migrate
 *   pnpm run migrate -- --config ./otra-carpeta/logger.config.json --env ./otra-carpeta/.env
 */
function parseArgs(argv: string[]): { configPath?: string; envPath?: string } {
  const result: { configPath?: string; envPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config") result.configPath = argv[++i];
    if (argv[i] === "--env") result.envPath = argv[++i];
  }
  return result;
}

async function main(): Promise<void> {
  const { configPath, envPath } = parseArgs(process.argv.slice(2));
  const config = loadConfig({ configPath, envPath });

  if (config.storage.strategy !== "postgresql") {
    console.error(
      `storage.strategy es "${config.storage.strategy}", no "postgresql" -- no hay migrations que correr.`
    );
    process.exit(1);
  }

  const pool = new Pool(buildPoolConfig(config.storage));

  try {
    console.log("Validando conexion a PostgreSQL...");
    await validateConnection(pool);

    console.log("Aplicando migrations pendientes...");
    const applied = await runMigrations(pool);

    if (applied.length === 0) {
      console.log("No habia migrations pendientes. El schema ya estaba al dia.");
    } else {
      for (const migration of applied) {
        console.log(`  aplicada: ${migration.version}_${migration.name}.sql`);
      }
      console.log(`${applied.length} migration(s) aplicada(s).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fallo la migration:", err instanceof Error ? err.message : err);
  process.exit(1);
});
