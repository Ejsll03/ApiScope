import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PerformanceConfig, SqliteStorageConfig } from "../../../src/config/types";
import { SqliteStorage } from "../../../src/storage/SqliteStorage";
import type { ManualLogRecord, RequestLogRecord } from "../../../src/types";

let tmpDir: string | undefined;
let storages: SqliteStorage[] = [];

afterEach(async () => {
  for (const storage of storages) {
    await storage.close();
  }
  storages = [];
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function newDbPath(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apiscope-sqlite-test-"));
  return path.join(tmpDir, "sub", "test.db");
}

function storageConfig(overrides: Partial<SqliteStorageConfig> = {}): SqliteStorageConfig {
  return {
    strategy: "sqlite",
    databasePath: newDbPath(),
    autoVacuum: true,
    journalMode: "WAL",
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

async function createStorage(
  storageOverrides: Partial<SqliteStorageConfig> = {},
  perfOverrides: Partial<PerformanceConfig> = {}
): Promise<SqliteStorage> {
  const storage = new SqliteStorage(storageConfig(storageOverrides), performanceConfig(perfOverrides));
  await storage.init();
  storages.push(storage);
  return storage;
}

function rawRowCount(databasePath: string, table: "requests" | "manual_logs"): number {
  const db = new Database(databasePath, { readonly: true });
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
    return row.count;
  } finally {
    db.close();
  }
}

function buildRequestLog(overrides: Partial<RequestLogRecord> = {}): RequestLogRecord {
  return {
    id: "req-1",
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
    requestId: "req-1",
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
    id: "manual-1",
    type: "manual",
    timestamp: "2026-01-01T00:00:00.000Z",
    level: "INFO",
    message: "hola",
    metadata: { foo: "bar" },
    context: { file: "server.ts", line: 10, function: "handler" },
    ...overrides,
  };
}

describe("SqliteStorage - schema", () => {
  it("crea el archivo .db, la carpeta contenedora y las tablas/indices al llamar init()", async () => {
    const config = storageConfig();
    const storage = await createStorage(config);
    void storage;

    expect(fs.existsSync(config.databasePath)).toBe(true);

    const db = new Database(config.databasePath, { readonly: true });
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r: any) => r.name);
      expect(tables).toContain("requests");
      expect(tables).toContain("manual_logs");

      const indices = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((r: any) => r.name);
      expect(indices).toContain("idx_requests_timestamp");
      expect(indices).toContain("idx_requests_path");
      expect(indices).toContain("idx_requests_status_code");
      expect(indices).toContain("idx_requests_method");
      expect(indices).toContain("idx_requests_latency");
    } finally {
      db.close();
    }
  });
});

describe("SqliteStorage - round-trip de datos", () => {
  it("guarda y recupera un RequestLogRecord completo via getRecordById", async () => {
    const storage = await createStorage();
    const record = buildRequestLog();
    await storage.saveRequestLog(record);

    const found = await storage.getRecordById("req-1");
    expect(found).toEqual(record);
  });

  it("guarda y recupera un ManualLogRecord completo via getRecordById", async () => {
    const storage = await createStorage();
    const record = buildManualLog();
    await storage.saveManualLog(record);

    const found = await storage.getRecordById("manual-1");
    expect(found).toEqual(record);
  });

  it("getRecordById devuelve null si el id no existe en ninguna tabla", async () => {
    const storage = await createStorage();
    expect(await storage.getRecordById("no-existe")).toBeNull();
  });

  it("getRecords mezcla requests y manual_logs ordenados por timestamp/id", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(
      buildRequestLog({ id: "r1", requestId: "r1", timestamp: "2026-01-01T00:00:00.000Z" })
    );
    await storage.saveManualLog(buildManualLog({ id: "m1", timestamp: "2026-01-01T00:00:01.000Z" }));
    await storage.saveRequestLog(
      buildRequestLog({ id: "r2", requestId: "r2", timestamp: "2026-01-01T00:00:02.000Z" })
    );

    const page = await storage.getRecords({ order: "asc" });
    expect(page.data.map((r) => r.id)).toEqual(["r1", "m1", "r2"]);
    expect(page.pagination.totalCount).toBe(3);
  });

  it("getRecords aplica filtros de RF-03 (ej. method) antes de paginar", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(buildRequestLog({ id: "get", requestId: "get", method: "GET" }));
    await storage.saveRequestLog(buildRequestLog({ id: "post", requestId: "post", method: "POST" }));

    const page = await storage.getRecords({ method: ["POST"] });
    expect(page.data.map((r) => r.id)).toEqual(["post"]);
    expect(page.pagination.totalCount).toBe(1);
  });
});

describe("SqliteStorage - getAllRequestLogs()", () => {
  it("devuelve solo RequestLogRecord, sin paginar y sin manual_logs", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    await storage.saveRequestLog(buildRequestLog({ id: "r2", requestId: "r2" }));
    await storage.saveManualLog(buildManualLog({ id: "m1" }));

    const all = await storage.getAllRequestLogs();
    expect(all.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(all.every((r) => r.type === "request")).toBe(true);
  });
});

describe("SqliteStorage - batching de escrituras", () => {
  it("no escribe en disco hasta alcanzar performance.batch_size", async () => {
    const config = storageConfig();
    const storage = await createStorage(config, { batchSize: 3, batchIntervalMs: 60_000 });

    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    await storage.saveRequestLog(buildRequestLog({ id: "r2", requestId: "r2" }));
    expect(rawRowCount(config.databasePath, "requests")).toBe(0);

    await storage.saveRequestLog(buildRequestLog({ id: "r3", requestId: "r3" }));
    expect(rawRowCount(config.databasePath, "requests")).toBe(3);
  });

  it("flushea automaticamente al vencer performance.batch_interval_ms", async () => {
    const config = storageConfig();
    const storage = await createStorage(config, { batchSize: 1000, batchIntervalMs: 30 });

    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    expect(rawRowCount(config.databasePath, "requests")).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(rawRowCount(config.databasePath, "requests")).toBe(1);
  });

  it("con async_logging=false escribe inmediatamente, sin esperar batch ni timer", async () => {
    const config = storageConfig();
    const storage = await createStorage(config, {
      asyncLogging: false,
      batchSize: 1000,
      batchIntervalMs: 60_000,
    });

    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    expect(rawRowCount(config.databasePath, "requests")).toBe(1);
  });

  it("flushea antes de superar performance.max_queue_size (queue overflow)", async () => {
    const config = storageConfig();
    const storage = await createStorage(config, {
      batchSize: 1000,
      batchIntervalMs: 60_000,
      maxQueueSize: 2,
    });

    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    await storage.saveRequestLog(buildRequestLog({ id: "r2", requestId: "r2" }));
    expect(rawRowCount(config.databasePath, "requests")).toBe(0);

    // El tercer registro haria que la cola supere max_queue_size -> flush forzado.
    await storage.saveRequestLog(buildRequestLog({ id: "r3", requestId: "r3" }));
    expect(rawRowCount(config.databasePath, "requests")).toBe(2);
  });

  it("getRecords fuerza el flush de lo que este pendiente en cola", async () => {
    const storage = await createStorage({}, { batchSize: 1000, batchIntervalMs: 60_000 });
    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));

    const page = await storage.getRecords();
    expect(page.data.map((r) => r.id)).toEqual(["r1"]);
  });

  it("close() flushea lo pendiente antes de cerrar la conexion", async () => {
    const config = storageConfig();
    const storage = new SqliteStorage(config, performanceConfig({ batchSize: 1000, batchIntervalMs: 60_000 }));
    await storage.init();
    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    expect(rawRowCount(config.databasePath, "requests")).toBe(0);

    await storage.close();
    expect(rawRowCount(config.databasePath, "requests")).toBe(1);
  });
});
