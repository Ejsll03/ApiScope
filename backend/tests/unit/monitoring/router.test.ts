import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { MonitoringConfig } from "../../../src/config/types";
import { createMonitoringRouter } from "../../../src/monitoring/router";
import { MemoryStorage } from "../../../src/storage/MemoryStorage";
import type { RequestLogRecord } from "../../../src/types";

function monitoringConfig(overrides: Partial<MonitoringConfig> = {}): MonitoringConfig {
  return {
    endpoint: "/api/monitoring",
    enabled: true,
    cacheMetrics: false,
    cacheDurationSeconds: 30,
    pageSize: 50,
    maxPageSize: 200,
    autoRefreshInterval: 30,
    auth: { enabled: false, type: "basic", username: null, password: null, sessionTimeoutHours: 1 },
    ...overrides,
  };
}

function buildRequestLog(overrides: Partial<RequestLogRecord> = {}): RequestLogRecord {
  return {
    id: "req-1",
    type: "request",
    requestId: "req-1",
    timestamp: "2026-01-01T00:00:00.000Z",
    method: "GET",
    fullUrl: "http://localhost/health",
    path: "/health",
    requestHeaders: {},
    queryParams: {},
    requestBody: undefined,
    clientIp: "127.0.0.1",
    userAgent: "vitest",
    statusCode: 200,
    responseHeaders: {},
    responseBody: undefined,
    latencyMs: 10,
    responseSizeBytes: 20,
    errorMessage: undefined,
    stackTrace: undefined,
    ...overrides,
  };
}

let server: ReturnType<Express["listen"]> | undefined;
let storage: MemoryStorage | undefined;

afterEach(async () => {
  server?.close();
  server = undefined;
  await storage?.close();
  storage = undefined;
});

async function startApp(monitoring: MonitoringConfig): Promise<{ baseUrl: string; storage: MemoryStorage }> {
  storage = new MemoryStorage({
    strategy: "memory",
    maxRecords: 5000,
    cleanupEnabled: false,
    cleanupIntervalMinutes: 10,
    cleanupOlderThanHours: 24,
  });
  await storage.init();

  const app = express();
  app.use("/api/monitoring", createMonitoringRouter(storage, monitoring));

  const baseUrl = await new Promise<string>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });

  return { baseUrl, storage };
}

describe("monitoring router - monitoring.enabled", () => {
  it("responde 404 en todas las rutas cuando monitoring.enabled es false", async () => {
    const { baseUrl } = await startApp(monitoringConfig({ enabled: false }));

    expect((await fetch(`${baseUrl}/api/monitoring/metrics`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/monitoring/requests`)).status).toBe(404);
  });
});

describe("monitoring router - auth", () => {
  it("exige Basic Auth en todas las rutas cuando monitoring.auth.enabled es true", async () => {
    const { baseUrl } = await startApp(
      monitoringConfig({ auth: { enabled: true, type: "basic", username: "admin", password: "s3cret", sessionTimeoutHours: 1 } })
    );

    expect((await fetch(`${baseUrl}/api/monitoring/metrics`)).status).toBe(401);

    const authHeader = `Basic ${Buffer.from("admin:s3cret").toString("base64")}`;
    const res = await fetch(`${baseUrl}/api/monitoring/metrics`, { headers: { authorization: authHeader } });
    expect(res.status).toBe(200);
  });
});

describe("monitoring router - GET /metrics", () => {
  it("devuelve metricas en snake_case calculadas sobre las requests guardadas", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    await store.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1", statusCode: 200 }));
    await store.saveRequestLog(buildRequestLog({ id: "r2", requestId: "r2", statusCode: 500 }));

    const res = await fetch(`${baseUrl}/api/monitoring/metrics`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests.total).toBe(2);
    expect(body.errors.total_5xx).toBe(1);
    expect(body.system.version).toEqual(expect.any(String));
  });
});

describe("monitoring router - GET /requests", () => {
  it("devuelve solo requests (no manual logs), paginadas, en formato snake_case", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    await store.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    await store.saveManualLog({ id: "m1", type: "manual", timestamp: "2026-01-01T00:00:00.000Z", level: "INFO", message: "hola" });

    const res = await fetch(`${baseUrl}/api/monitoring/requests`);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("r1");
    expect(body.pagination).toHaveProperty("total_count", 1);
  });

  it("filtra por method y status_code via query params", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    await store.saveRequestLog(buildRequestLog({ id: "get-ok", requestId: "get-ok", method: "GET", statusCode: 200 }));
    await store.saveRequestLog(buildRequestLog({ id: "post-ok", requestId: "post-ok", method: "POST", statusCode: 200 }));
    await store.saveRequestLog(buildRequestLog({ id: "get-err", requestId: "get-err", method: "GET", statusCode: 500 }));

    const res = await fetch(`${baseUrl}/api/monitoring/requests?method=GET&status_code=200`);
    const body = await res.json();
    expect(body.data.map((r: { id: string }) => r.id)).toEqual(["get-ok"]);
  });

  it("con type=all mezcla requests y manual logs; con type=manual trae solo manuales", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    await store.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));
    await store.saveManualLog({ id: "m1", type: "manual", timestamp: "2026-01-01T00:00:00.000Z", level: "INFO", message: "hola" });

    const all = await (await fetch(`${baseUrl}/api/monitoring/requests?type=all`)).json();
    expect(all.data.map((r: { id: string }) => r.id).sort()).toEqual(["m1", "r1"]);

    const manualOnly = await (await fetch(`${baseUrl}/api/monitoring/requests?type=manual`)).json();
    expect(manualOnly.data.map((r: { id: string }) => r.id)).toEqual(["m1"]);
  });

  it("filtra por has_error=true", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    await store.saveRequestLog(buildRequestLog({ id: "ok", requestId: "ok", statusCode: 200 }));
    await store.saveRequestLog(buildRequestLog({ id: "err", requestId: "err", statusCode: 500 }));

    const res = await fetch(`${baseUrl}/api/monitoring/requests?has_error=true`);
    const body = await res.json();
    expect(body.data.map((r: { id: string }) => r.id)).toEqual(["err"]);
  });

  it("navega adelante con next_cursor y atras con prev_cursor + direction=before", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    for (const id of ["r1", "r2", "r3"]) {
      await store.saveRequestLog(
        buildRequestLog({ id, requestId: id, timestamp: `2026-01-01T00:00:0${id.slice(1)}.000Z` })
      );
    }

    const page1 = await (await fetch(`${baseUrl}/api/monitoring/requests?limit=2&order=asc`)).json();
    expect(page1.data.map((r: { id: string }) => r.id)).toEqual(["r1", "r2"]);

    const page2 = await (
      await fetch(`${baseUrl}/api/monitoring/requests?limit=2&order=asc&cursor=${page1.pagination.next_cursor}`)
    ).json();
    expect(page2.data.map((r: { id: string }) => r.id)).toEqual(["r3"]);

    const backToPage1 = await (
      await fetch(
        `${baseUrl}/api/monitoring/requests?limit=2&order=asc&cursor=${page2.pagination.prev_cursor}&direction=before`
      )
    ).json();
    expect(backToPage1.data.map((r: { id: string }) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("monitoring router - GET /requests/:id", () => {
  it("devuelve el detalle de una request existente", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    await store.saveRequestLog(buildRequestLog({ id: "r1", requestId: "r1" }));

    const res = await fetch(`${baseUrl}/api/monitoring/requests/r1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("r1");
    expect(body.full_url).toBe("http://localhost/health");
  });

  it("responde 404 si el id no existe", async () => {
    const { baseUrl } = await startApp(monitoringConfig());
    const res = await fetch(`${baseUrl}/api/monitoring/requests/no-existe`);
    expect(res.status).toBe(404);
  });

  it("devuelve el detalle de un manual log (RF-05: mismo endpoint que las requests)", async () => {
    const { baseUrl, storage: store } = await startApp(monitoringConfig());
    await store.saveManualLog({ id: "m1", type: "manual", timestamp: "2026-01-01T00:00:00.000Z", level: "INFO", message: "hola" });

    const res = await fetch(`${baseUrl}/api/monitoring/requests/m1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "m1", type: "manual", level: "INFO", message: "hola" });
  });
});
