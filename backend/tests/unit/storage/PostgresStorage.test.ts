import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PerformanceConfig, PostgresStorageConfig } from "../../../src/config/types";
import type { ManualLogRecord, RequestLogRecord } from "../../../src/types";

/**
 * PostgresStorage se testea contra pg-mem (emulador en memoria del motor
 * SQL de Postgres) en vez de un servidor real -- no hay Docker/Postgres
 * disponible en esta maquina (ver PROGRESS.md, decision tomada con el
 * usuario). Cada test resetea los modulos y vuelve a mockear "pg" con un
 * newDb() fresco, asi los tests quedan aislados entre si igual que
 * SqliteStorage usa un archivo .db temporal distinto por test.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PostgresStorage: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storages: any[] = [];

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("pg", async () => {
    const { newDb } = await import("pg-mem");
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    return { Pool };
  });

  ({ PostgresStorage } = await import("../../../src/storage/PostgresStorage"));
});

afterEach(async () => {
  for (const storage of storages) {
    await storage.close();
  }
  storages = [];
  vi.doUnmock("pg");
  vi.resetModules();
});

function storageConfig(overrides: Partial<PostgresStorageConfig> = {}): PostgresStorageConfig {
  return {
    strategy: "postgresql",
    host: "localhost",
    port: 5432,
    database: "apiscope_test",
    user: "apiscope",
    password: "test",
    poolSize: 10,
    timeoutMs: 5000,
    ssl: false,
    autoMigrate: true,
    ...overrides,
  };
}

function performanceConfig(overrides: Partial<PerformanceConfig> = {}): PerformanceConfig {
  return {
    asyncLogging: true,
    batchSize: 50,
    batchIntervalMs: 1000,
    maxQueueSize: 1000,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createStorage(
  storageOverrides: Partial<PostgresStorageConfig> = {},
  perfOverrides: Partial<PerformanceConfig> = {}
): Promise<any> {
  const storage = new PostgresStorage(storageConfig(storageOverrides), performanceConfig(perfOverrides));
  await storage.init();
  storages.push(storage);
  return storage;
}

async function rawRowCount(table: "requests" | "manual_logs"): Promise<number> {
  const pg = await import("pg");
  const pool = new pg.Pool();
  const res = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return res.rows[0].count;
}

// La columna `id` es UUID en el schema de Postgres (seccion 4.3 del PRD),
// a diferencia de SQLite donde es TEXT sin formato exigido -- generateId()
// (src/utils/ids.ts) siempre produce UUID v4 real, asi que los fixtures
// usan UUIDs validos en vez de strings cortos tipo "r1".
const UUID = {
  req1: "11111111-1111-1111-1111-111111111111",
  r1: "11111111-1111-1111-1111-111111111111",
  r2: "22222222-2222-2222-2222-222222222222",
  r3: "33333333-3333-3333-3333-333333333333",
  m1: "44444444-4444-4444-4444-444444444444",
  manual1: "55555555-5555-5555-5555-555555555555",
  missing: "99999999-9999-9999-9999-999999999999",
};

function buildRequestLog(overrides: Partial<RequestLogRecord> = {}): RequestLogRecord {
  return {
    id: UUID.req1,
    type: "request",
    timestamp: "2026-01-01T00:00:00.000Z",
    method: "GET",
    fullUrl: "http://localhost/health",
    path: "/health",
    requestHeaders: { "content-type": "application/json" },
    queryParams: { verbose: "true" },
    requestBody: { hello: "world" },
    clientIp: "127.0.0.1",
    userAgent: "vitest",
    requestId: UUID.req1,
    statusCode: 200,
    responseHeaders: { "x-reply": "pong" },
    responseBody: { ok: true },
    latencyMs: 12.34,
    responseSizeBytes: 42,
    errorMessage: undefined,
    stackTrace: undefined,
    ...overrides,
  };
}

function buildManualLog(overrides: Partial<ManualLogRecord> = {}): ManualLogRecord {
  return {
    id: UUID.manual1,
    type: "manual",
    timestamp: "2026-01-01T00:00:00.000Z",
    level: "INFO",
    message: "hola",
    metadata: { foo: "bar" },
    context: { file: "server.ts", line: 10, function: "handler" },
    ...overrides,
  };
}

describe("PostgresStorage - migrations en init()", () => {
  it("con auto_migrate=true crea el schema (tablas requests/manual_logs) al llamar init()", async () => {
    await createStorage({ autoMigrate: true });
    await expect(rawRowCount("requests")).resolves.toBe(0);
    await expect(rawRowCount("manual_logs")).resolves.toBe(0);
  });

  it("con auto_migrate=false NO corre migrations: las tablas no existen", async () => {
    await createStorage({ autoMigrate: false });
    await expect(rawRowCount("requests")).rejects.toThrow();
  });

  it("valida la conexion en init() y falla claro si el pool no responde", async () => {
    vi.resetModules();
    vi.doMock("pg", () => ({
      Pool: class {
        query() {
          return Promise.reject(new Error("connection refused"));
        }
        connect() {
          return Promise.reject(new Error("connection refused"));
        }
        on() {}
      },
    }));
    const { PostgresStorage: BrokenPostgresStorage } = await import(
      "../../../src/storage/PostgresStorage"
    );
    const storage = new BrokenPostgresStorage(storageConfig(), performanceConfig());
    await expect(storage.init()).rejects.toThrow();
  });
});

describe("PostgresStorage - round-trip de datos", () => {
  it("guarda y recupera un RequestLogRecord completo via getRecordById", async () => {
    const storage = await createStorage();
    const record = buildRequestLog();
    await storage.saveRequestLog(record);

    const found = await storage.getRecordById(UUID.req1);
    expect(found).toEqual(record);
  });

  it("guarda y recupera un ManualLogRecord completo via getRecordById", async () => {
    const storage = await createStorage();
    const record = buildManualLog();
    await storage.saveManualLog(record);

    const found = await storage.getRecordById(UUID.manual1);
    expect(found).toEqual(record);
  });

  it("getRecordById devuelve null si el id no existe en ninguna tabla", async () => {
    const storage = await createStorage();
    expect(await storage.getRecordById(UUID.missing)).toBeNull();
  });

  it("getRecords mezcla requests y manual_logs ordenados por timestamp/id", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(
      buildRequestLog({ id: UUID.r1, requestId: UUID.r1, timestamp: "2026-01-01T00:00:00.000Z" })
    );
    await storage.saveManualLog(
      buildManualLog({ id: UUID.m1, timestamp: "2026-01-01T00:00:01.000Z" })
    );
    await storage.saveRequestLog(
      buildRequestLog({ id: UUID.r2, requestId: UUID.r2, timestamp: "2026-01-01T00:00:02.000Z" })
    );

    const page = await storage.getRecords({ order: "asc" });
    expect(page.data.map((r: RequestLogRecord | ManualLogRecord) => r.id)).toEqual([
      UUID.r1,
      UUID.m1,
      UUID.r2,
    ]);
    expect(page.pagination.totalCount).toBe(3);
  });

  it("getRecords aplica filtros de RF-03 (ej. method) antes de paginar", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1, method: "GET" }));
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r2, requestId: UUID.r2, method: "POST" }));

    const page = await storage.getRecords({ method: ["POST"] });
    expect(page.data.map((r: RequestLogRecord) => r.id)).toEqual([UUID.r2]);
    expect(page.pagination.totalCount).toBe(1);
  });
});

describe("PostgresStorage - getAllRequestLogs()", () => {
  it("devuelve solo RequestLogRecord, sin paginar y sin manual_logs", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1 }));
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r2, requestId: UUID.r2 }));
    await storage.saveManualLog(buildManualLog({ id: UUID.m1 }));

    const all = await storage.getAllRequestLogs();
    expect(all.map((r: RequestLogRecord) => r.id).sort()).toEqual([UUID.r1, UUID.r2].sort());
    expect(all.every((r: RequestLogRecord) => r.type === "request")).toBe(true);
  });
});

describe("PostgresStorage - batching de escrituras", () => {
  it("no escribe en la tabla hasta alcanzar performance.batch_size", async () => {
    const storage = await createStorage({}, { batchSize: 3, batchIntervalMs: 60_000 });

    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1 }));
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r2, requestId: UUID.r2 }));
    expect(await rawRowCount("requests")).toBe(0);

    await storage.saveRequestLog(buildRequestLog({ id: UUID.r3, requestId: UUID.r3 }));
    expect(await rawRowCount("requests")).toBe(3);
  });

  it("flushea automaticamente al vencer performance.batch_interval_ms", async () => {
    const storage = await createStorage({}, { batchSize: 1000, batchIntervalMs: 30 });

    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1 }));
    expect(await rawRowCount("requests")).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await rawRowCount("requests")).toBe(1);
  });

  it("con async_logging=false escribe inmediatamente, sin esperar batch ni timer", async () => {
    const storage = await createStorage(
      {},
      { asyncLogging: false, batchSize: 1000, batchIntervalMs: 60_000 }
    );

    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1 }));
    expect(await rawRowCount("requests")).toBe(1);
  });

  it("flushea antes de superar performance.max_queue_size (queue overflow)", async () => {
    const storage = await createStorage(
      {},
      { batchSize: 1000, batchIntervalMs: 60_000, maxQueueSize: 2 }
    );

    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1 }));
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r2, requestId: UUID.r2 }));
    expect(await rawRowCount("requests")).toBe(0);

    await storage.saveRequestLog(buildRequestLog({ id: UUID.r3, requestId: UUID.r3 }));
    expect(await rawRowCount("requests")).toBe(2);
  });

  it("getRecords fuerza el flush de lo que este pendiente en cola", async () => {
    const storage = await createStorage({}, { batchSize: 1000, batchIntervalMs: 60_000 });
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1 }));

    const page = await storage.getRecords();
    expect(page.data.map((r: RequestLogRecord) => r.id)).toEqual([UUID.r1]);
  });

  it("close() flushea lo pendiente antes de cerrar el pool", async () => {
    const storage = await createStorage({}, { batchSize: 1000, batchIntervalMs: 60_000 });
    await storage.saveRequestLog(buildRequestLog({ id: UUID.r1, requestId: UUID.r1 }));
    expect(await rawRowCount("requests")).toBe(0);

    // Removemos del array de cleanup: ya lo cerramos nosotros aca.
    storages = storages.filter((s) => s !== storage);
    await storage.close();
    expect(await rawRowCount("requests")).toBe(1);
  });
});
