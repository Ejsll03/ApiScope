import { describe, expect, it } from "vitest";
import { toHttpLogRecord, toHttpMetrics, toHttpPage } from "../../../src/monitoring/serializers";
import type { CursorPage } from "../../../src/storage/types";
import type { LogRecord, ManualLogRecord, RequestLogRecord } from "../../../src/types";
import type { MetricsSnapshot } from "../../../src/monitoring/metrics";

/**
 * El limite HTTP de ApiScope usa snake_case, igual criterio que
 * logger.config.json (snake_case en JSON, camelCase en TS interno). Solo
 * se renombran los campos que definimos nosotros -- request_body,
 * response_body, metadata, request_query, request_headers/
 * response_headers y context viajan intactos: son datos opacos del
 * consumidor (o nombres de headers HTTP reales), no identificadores
 * nuestros, y no deben reescribirse.
 */

function requestLog(overrides: Partial<RequestLogRecord> = {}): RequestLogRecord {
  return {
    id: "req-1",
    type: "request",
    requestId: "req-1",
    timestamp: "2026-01-01T00:00:00.000Z",
    method: "GET",
    fullUrl: "http://localhost/users?userId=5",
    path: "/users",
    requestHeaders: { "content-type": "application/json" },
    queryParams: { userId: "5" },
    requestBody: { userName: "erick" },
    clientIp: "127.0.0.1",
    userAgent: "vitest",
    statusCode: 200,
    responseHeaders: { "x-reply": "pong" },
    responseBody: { userId: 5 },
    latencyMs: 12.5,
    responseSizeBytes: 42,
    errorMessage: undefined,
    stackTrace: undefined,
    ...overrides,
  };
}

function manualLog(overrides: Partial<ManualLogRecord> = {}): ManualLogRecord {
  return {
    id: "manual-1",
    type: "manual",
    timestamp: "2026-01-01T00:00:00.000Z",
    level: "INFO",
    message: "hola",
    metadata: { userId: 5 },
    context: { file: "server.ts", line: 10, function: "handler" },
    ...overrides,
  };
}

describe("toHttpLogRecord - RequestLogRecord", () => {
  it("mapea los campos propios a snake_case", () => {
    const http = toHttpLogRecord(requestLog()) as Record<string, unknown>;
    expect(http.full_url).toBe("http://localhost/users?userId=5");
    expect(http.client_ip).toBe("127.0.0.1");
    expect(http.user_agent).toBe("vitest");
    expect(http.status_code).toBe(200);
    expect(http.latency_ms).toBe(12.5);
    expect(http.response_size_bytes).toBe(42);
    expect(http).not.toHaveProperty("fullUrl");
    expect(http).not.toHaveProperty("statusCode");
  });

  it("NO reescribe las claves de request_body/response_body/metadata (datos opacos del consumidor)", () => {
    const http = toHttpLogRecord(requestLog()) as Record<string, unknown>;
    // userName/userId son camelCase A PROPOSITO en el fixture: si el
    // serializer los tocara, esta asercion fallaria.
    expect(http.request_body).toEqual({ userName: "erick" });
    expect(http.response_body).toEqual({ userId: 5 });
    expect(http.request_query).toEqual({ userId: "5" });
  });

  it("distingue request_headers de response_headers sin pisarse", () => {
    const http = toHttpLogRecord(requestLog()) as Record<string, unknown>;
    expect(http.request_headers).toEqual({ "content-type": "application/json" });
    expect(http.response_headers).toEqual({ "x-reply": "pong" });
  });
});

describe("toHttpLogRecord - ManualLogRecord", () => {
  it("mapea stack_trace y deja metadata/context intactos", () => {
    const http = toHttpLogRecord(manualLog({ stackTrace: "Error: boom" })) as Record<string, unknown>;
    expect(http.stack_trace).toBe("Error: boom");
    expect(http.metadata).toEqual({ userId: 5 });
    expect(http.context).toEqual({ file: "server.ts", line: 10, function: "handler" });
    expect(http).not.toHaveProperty("stackTrace");
  });
});

describe("toHttpPage", () => {
  it("mapea la paginacion a snake_case (RF-03: has_more/next_cursor/prev_cursor/total_count)", () => {
    const page: CursorPage<LogRecord> = {
      data: [requestLog()],
      pagination: { hasMore: true, nextCursor: "abc", prevCursor: null, totalCount: 5 },
    };
    const http = toHttpPage(page);
    expect(http.pagination).toEqual({
      has_more: true,
      next_cursor: "abc",
      prev_cursor: null,
      total_count: 5,
    });
    expect(http.data).toHaveLength(1);
  });
});

describe("toHttpMetrics", () => {
  it("mapea todos los campos propios a snake_case", () => {
    const metrics: MetricsSnapshot = {
      requests: { total: 1, byMethod: { GET: 1 }, byStatus: { "2xx": 1, "3xx": 0, "4xx": 0, "5xx": 0 }, ratePerMinute: 1 },
      performance: { latencyAvgMs: 10, latencyMinMs: 5, latencyMaxMs: 15, p50Ms: 10, p95Ms: 15, p99Ms: 15 },
      errors: { total4xx: 0, total5xx: 0, byEndpoint: [{ path: "/x", count: 1 }] },
      system: { uptimeSeconds: 100, version: "0.1.0", memory: { rss: 1, heapUsed: 2, heapTotal: 3 } },
      topEndpoints: [{ path: "/x", count: 1 }],
      slowestEndpoints: [{ path: "/x", avgLatencyMs: 10 }],
    };

    const http = toHttpMetrics(metrics);
    expect(http.requests).toEqual({ total: 1, by_method: { GET: 1 }, by_status: { "2xx": 1, "3xx": 0, "4xx": 0, "5xx": 0 }, rate_per_minute: 1 });
    expect(http.performance).toEqual({
      latency_avg_ms: 10,
      latency_min_ms: 5,
      latency_max_ms: 15,
      p50_ms: 10,
      p95_ms: 15,
      p99_ms: 15,
    });
    expect(http.errors).toEqual({ total_4xx: 0, total_5xx: 0, by_endpoint: [{ path: "/x", count: 1 }] });
    expect(http.system).toEqual({ uptime_seconds: 100, version: "0.1.0", memory: { rss: 1, heap_used: 2, heap_total: 3 } });
    expect(http.top_endpoints).toEqual([{ path: "/x", count: 1 }]);
    expect(http.slowest_endpoints).toEqual([{ path: "/x", avg_latency_ms: 10 }]);
  });
});
