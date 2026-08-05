import { afterEach, describe, expect, it } from "vitest";
import type { MemoryStorageConfig } from "../../../src/config/types";
import { MemoryStorage } from "../../../src/storage/MemoryStorage";
import type { ManualLogRecord, RequestLogRecord } from "../../../src/types";

/**
 * MemoryStorage no tenia suite propia (quedaba pendiente para la fase 6,
 * ver PROGRESS.md). Se agrega aca el minimo que toca esta fase --
 * filtros de RF-03 aplicados en getRecords() y el nuevo getAllRequestLogs()
 * -- sin backfillear cobertura de comportamiento ya ejercitado
 * indirectamente por captureMiddleware.test.ts (cleanup, FIFO, etc, siguen
 * siendo alcance de fase 6).
 */

let storages: MemoryStorage[] = [];

afterEach(async () => {
  for (const storage of storages) {
    await storage.close();
  }
  storages = [];
});

function storageConfig(overrides: Partial<MemoryStorageConfig> = {}): MemoryStorageConfig {
  return {
    strategy: "memory",
    maxRecords: 5000,
    cleanupEnabled: false,
    cleanupIntervalMinutes: 10,
    cleanupOlderThanHours: 24,
    ...overrides,
  };
}

async function createStorage(overrides: Partial<MemoryStorageConfig> = {}): Promise<MemoryStorage> {
  const storage = new MemoryStorage(storageConfig(overrides));
  await storage.init();
  storages.push(storage);
  return storage;
}

function buildRequestLog(overrides: Partial<RequestLogRecord> = {}): RequestLogRecord {
  return {
    id: "req-1",
    type: "request",
    timestamp: "2026-01-01T00:00:00.000Z",
    method: "GET",
    fullUrl: "http://localhost/health",
    path: "/health",
    requestHeaders: {},
    queryParams: {},
    requestBody: undefined,
    clientIp: "127.0.0.1",
    userAgent: "vitest",
    requestId: "req-1",
    statusCode: 200,
    responseHeaders: {},
    responseBody: undefined,
    latencyMs: 12,
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
    ...overrides,
  };
}

describe("MemoryStorage - filtros de RF-03 en getRecords()", () => {
  it("aplica filtros (method) antes de paginar, afectando totalCount", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1", method: "GET" }));
    await storage.saveRequestLog(buildRequestLog({ id: "r2", requestId: "r2", method: "POST" }));
    await storage.saveManualLog(buildManualLog({ id: "m1" }));

    const page = await storage.getRecords({ method: ["GET"] });
    expect(page.data.map((r) => r.id)).toEqual(["r1"]);
    expect(page.pagination.totalCount).toBe(1);
  });

  it("sin filtros, sigue mezclando requests y manual_logs como antes", async () => {
    const storage = await createStorage();
    await storage.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    await storage.saveManualLog(buildManualLog({ id: "m1" }));

    const page = await storage.getRecords();
    expect(page.data.map((r) => r.id).sort()).toEqual(["m1", "r1"]);
  });
});

describe("MemoryStorage - getAllRequestLogs()", () => {
  it("devuelve solo RequestLogRecord, sin paginar y sin manual_logs", async () => {
    const storage = await createStorage();
    for (let i = 0; i < 5; i++) {
      await storage.saveRequestLog(buildRequestLog({ id: `r${i}`, requestId: `r${i}` }));
    }
    await storage.saveManualLog(buildManualLog({ id: "m1" }));

    const all = await storage.getAllRequestLogs();
    expect(all).toHaveLength(5);
    expect(all.every((r) => r.type === "request")).toBe(true);
  });

  it("devuelve array vacio si no hay requests guardadas", async () => {
    const storage = await createStorage();
    expect(await storage.getAllRequestLogs()).toEqual([]);
  });
});
