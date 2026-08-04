import fs from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

const MIGRATION_FILENAME_RE = /^(\d+)_(.+)\.sql$/;

export interface MigrationRecord {
  version: number;
  name: string;
}

interface Migration extends MigrationRecord {
  sql: string;
}

/**
 * Errores de conexion o de una migration puntual. Se distingue de
 * ConfigValidationError (config/loadConfig.ts) porque estos ocurren en
 * runtime contra un servidor real, no al parsear el JSON de config.
 */
export class MigrationError extends Error {
  // Error.cause es ES2022; el tsconfig del paquete apunta a ES2020 (ver
  // decision de compatibilidad en tsconfig.json), asi que se declara el
  // campo a mano en vez de subir el target solo por esto.
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(`ApiScope migration error: ${message}`);
    this.name = "MigrationError";
    if (cause !== undefined) this.cause = cause;
  }
}

function loadMigrations(dir: string): Migration[] {
  return fs
    .readdirSync(dir)
    .map((filename) => {
      const match = MIGRATION_FILENAME_RE.exec(filename);
      if (!match) return null;
      return {
        version: Number(match[1]),
        name: match[2],
        sql: fs.readFileSync(path.join(dir, filename), "utf-8"),
      };
    })
    .filter((m): m is Migration => m !== null)
    .sort((a, b) => a.version - b.version);
}

/**
 * RF-04.3 ("Validacion: Validacion de conexion antes de ejecutar"). Se
 * corre siempre antes de tocar el schema, tanto desde runMigrations() como
 * desde el comando CLI (scripts/migrate.ts).
 */
export async function validateConnection(pool: Pool): Promise<void> {
  try {
    await pool.query("SELECT 1");
  } catch (cause) {
    throw new MigrationError(
      "no se pudo conectar a PostgreSQL. Revisa host/puerto/credenciales/connection_string.",
      cause
    );
  }
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  // Existence check explicito en vez de confiar solo en "CREATE TABLE IF
  // NOT EXISTS": pg-mem (usado en tests, ver PROGRESS.md) no soporta
  // re-ejecutar ese mismo DDL una vez que la tabla ya existe. Postgres real
  // no tiene ese problema, pero este chequeo evita el statement de mas en
  // cualquier caso -- runMigrations() corre en cada arranque si
  // auto_migrate esta activo, no solo la primera vez.
  const exists = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'
     ) AS exists`
  );
  if (exists.rows[0]?.exists) return;

  await client.query(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(client: PoolClient): Promise<Set<number>> {
  const result = await client.query<{ version: number }>(
    "SELECT version FROM schema_migrations"
  );
  return new Set(result.rows.map((row) => row.version));
}

/**
 * Aplica las migrations pendientes de `migrationsDir` (por default, los
 * .sql numerados junto a este archivo) en orden ascendente. Cada migration
 * corre en su propia transaccion junto con el INSERT que la registra en
 * `schema_migrations`: si el SQL falla, ambos se revierten (Postgres
 * soporta DDL transaccional), asi nunca queda una version marcada como
 * aplicada sin estarlo de verdad (RF-04.3: "Rollback: capacidad de
 * rollback en caso de error").
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir: string = __dirname
): Promise<MigrationRecord[]> {
  await validateConnection(pool);

  const migrations = loadMigrations(migrationsDir);
  const client = await pool.connect();
  const applied: MigrationRecord[] = [];

  try {
    await ensureMigrationsTable(client);
    const appliedVersions = await getAppliedVersions(client);

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;

      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
          [migration.version, migration.name]
        );
        await client.query("COMMIT");
      } catch (cause) {
        await client.query("ROLLBACK");
        throw new MigrationError(
          `fallo aplicando la migration ${migration.version}_${migration.name}.sql`,
          cause
        );
      }

      applied.push({ version: migration.version, name: migration.name });
    }
  } finally {
    client.release();
  }

  return applied;
}
