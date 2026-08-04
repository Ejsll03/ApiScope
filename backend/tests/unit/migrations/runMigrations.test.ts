import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Pool as PgPool } from "pg";
import { newDb } from "pg-mem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MigrationError, runMigrations, validateConnection } from "../../../src/migrations/runMigrations";

function createPool(): PgPool {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgPool;
}

function writeMigration(dir: string, filename: string, sql: string): void {
  fs.writeFileSync(path.join(dir, filename), sql, "utf-8");
}

describe("runMigrations", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "apiscope-migrations-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("aplica las migrations pendientes en orden numerico y las registra en schema_migrations", async () => {
    writeMigration(dir, "002_b.sql", "CREATE TABLE b (id TEXT PRIMARY KEY);");
    writeMigration(dir, "001_a.sql", "CREATE TABLE a (id TEXT PRIMARY KEY);");
    const pool = createPool();

    const applied = await runMigrations(pool, dir);

    expect(applied).toEqual([
      { version: 1, name: "a" },
      { version: 2, name: "b" },
    ]);

    const rows = await pool.query(
      "SELECT version, name FROM schema_migrations ORDER BY version ASC"
    );
    expect(rows.rows).toEqual([
      { version: 1, name: "a" },
      { version: 2, name: "b" },
    ]);

    // Ambas tablas quedaron creadas de verdad, no solo registradas.
    await expect(pool.query("SELECT * FROM a")).resolves.toBeDefined();
    await expect(pool.query("SELECT * FROM b")).resolves.toBeDefined();
  });

  it("no vuelve a aplicar una migration ya registrada en una corrida posterior", async () => {
    writeMigration(dir, "001_a.sql", "CREATE TABLE a (id TEXT PRIMARY KEY);");
    const pool = createPool();

    const firstRun = await runMigrations(pool, dir);
    expect(firstRun).toHaveLength(1);

    const secondRun = await runMigrations(pool, dir);
    expect(secondRun).toEqual([]);

    const rows = await pool.query("SELECT version FROM schema_migrations");
    expect(rows.rows).toHaveLength(1);
  });

  it("aplica solo las migrations nuevas si ya habia otras aplicadas", async () => {
    writeMigration(dir, "001_a.sql", "CREATE TABLE a (id TEXT PRIMARY KEY);");
    const pool = createPool();
    await runMigrations(pool, dir);

    writeMigration(dir, "002_b.sql", "CREATE TABLE b (id TEXT PRIMARY KEY);");
    const secondRun = await runMigrations(pool, dir);

    expect(secondRun).toEqual([{ version: 2, name: "b" }]);
  });

  it("lanza MigrationError y no registra la version cuando el SQL de una migration es invalido", async () => {
    writeMigration(dir, "001_bad.sql", "ESTO NO ES SQL VALIDO;");
    const pool = createPool();

    await expect(runMigrations(pool, dir)).rejects.toThrow(MigrationError);

    const rows = await pool.query("SELECT version FROM schema_migrations");
    expect(rows.rows).toHaveLength(0);
  });

  it("valida la conexion antes de intentar aplicar migrations", async () => {
    const brokenPool = {
      query: () => Promise.reject(new Error("connection refused")),
      connect: () => Promise.reject(new Error("connection refused")),
    } as unknown as PgPool;

    writeMigration(dir, "001_a.sql", "CREATE TABLE a (id TEXT PRIMARY KEY);");

    await expect(runMigrations(brokenPool, dir)).rejects.toThrow(MigrationError);
    await expect(validateConnection(brokenPool)).rejects.toThrow(MigrationError);
  });
});
