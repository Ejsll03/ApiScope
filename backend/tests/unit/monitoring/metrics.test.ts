import { describe, expect, it } from "vitest";
import { calculateMetrics, getSystemInfo } from "../../../src/monitoring/metrics";
import type { RequestLogRecord } from "../../../src/types";

const baseFields = {
  fullUrl: "http://localhost/x",
  requestHeaders: {},
  queryParams: {},
  requestBody: undefined,
  clientIp: "127.0.0.1",
  userAgent: "vitest",
  responseHeaders: {},
  responseBody: undefined,
  responseSizeBytes: 0,
  errorMessage: undefined,
  stackTrace: undefined,
};

function record(overrides: Partial<RequestLogRecord> = {}): RequestLogRecord {
  return {
    id: "r1",
    type: "request",
    requestId: "r1",
    timestamp: "2026-01-01T00:00:00.000Z",
    method: "GET",
    path: "/health",
    statusCode: 200,
    latencyMs: 10,
    ...baseFields,
    ...overrides,
  };
}

describe("calculateMetrics - conjunto vacio", () => {
  it("no explota y devuelve ceros/arrays vacios", () => {
    const metrics = calculateMetrics([]);
    expect(metrics.requests.total).toBe(0);
    expect(metrics.requests.byMethod).toEqual({});
    expect(metrics.requests.byStatus).toEqual({ "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 });
    expect(metrics.requests.ratePerMinute).toBe(0);
    expect(metrics.performance.latencyAvgMs).toBe(0);
    expect(metrics.performance.p95Ms).toBe(0);
    expect(metrics.errors.total4xx).toBe(0);
    expect(metrics.errors.total5xx).toBe(0);
    expect(metrics.errors.byEndpoint).toEqual([]);
    expect(metrics.topEndpoints).toEqual([]);
    expect(metrics.slowestEndpoints).toEqual([]);
  });
});

describe("calculateMetrics - requests (total, byMethod, byStatus, ratePerMinute)", () => {
  it("cuenta el total y agrupa por metodo", () => {
    const records = [
      record({ id: "1", method: "GET" }),
      record({ id: "2", method: "GET" }),
      record({ id: "3", method: "POST" }),
    ];
    const metrics = calculateMetrics(records);
    expect(metrics.requests.total).toBe(3);
    expect(metrics.requests.byMethod).toEqual({ GET: 2, POST: 1 });
  });

  it("agrupa por status en buckets 2xx/3xx/4xx/5xx", () => {
    const records = [
      record({ id: "1", statusCode: 200 }),
      record({ id: "2", statusCode: 301 }),
      record({ id: "3", statusCode: 404 }),
      record({ id: "4", statusCode: 404 }),
      record({ id: "5", statusCode: 500 }),
    ];
    const metrics = calculateMetrics(records);
    expect(metrics.requests.byStatus).toEqual({ "2xx": 1, "3xx": 1, "4xx": 2, "5xx": 1 });
  });

  it("ratePerMinute cuenta solo las requests dentro del ultimo minuto respecto a `now`", () => {
    const now = new Date("2026-01-01T00:05:00.000Z");
    const records = [
      record({ id: "recent1", timestamp: "2026-01-01T00:04:30.000Z" }),
      record({ id: "recent2", timestamp: "2026-01-01T00:04:45.000Z" }),
      record({ id: "old", timestamp: "2026-01-01T00:00:00.000Z" }),
    ];
    const metrics = calculateMetrics(records, { now });
    expect(metrics.requests.ratePerMinute).toBe(2);
  });
});

describe("calculateMetrics - performance (latencia + percentiles)", () => {
  it("calcula avg/min/max de latencia", () => {
    const records = [
      record({ id: "1", latencyMs: 10 }),
      record({ id: "2", latencyMs: 20 }),
      record({ id: "3", latencyMs: 30 }),
    ];
    const metrics = calculateMetrics(records);
    expect(metrics.performance.latencyAvgMs).toBe(20);
    expect(metrics.performance.latencyMinMs).toBe(10);
    expect(metrics.performance.latencyMaxMs).toBe(30);
  });

  it("calcula percentiles p50/p95/p99 (metodo nearest-rank)", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record({ id: `r${i}`, latencyMs: (i + 1) * 10 })
    ); // 10,20,...,100
    const metrics = calculateMetrics(records);
    expect(metrics.performance.p50Ms).toBe(50);
    expect(metrics.performance.p95Ms).toBe(100);
    expect(metrics.performance.p99Ms).toBe(100);
  });
});

describe("calculateMetrics - errores (totales + distribucion por endpoint)", () => {
  it("cuenta total4xx/total5xx y agrupa errores por path", () => {
    const records = [
      record({ id: "1", path: "/a", statusCode: 200 }),
      record({ id: "2", path: "/a", statusCode: 404 }),
      record({ id: "3", path: "/b", statusCode: 404 }),
      record({ id: "4", path: "/b", statusCode: 500 }),
    ];
    const metrics = calculateMetrics(records);
    expect(metrics.errors.total4xx).toBe(2);
    expect(metrics.errors.total5xx).toBe(1);
    expect(metrics.errors.byEndpoint).toEqual(
      expect.arrayContaining([
        { path: "/a", count: 1 },
        { path: "/b", count: 2 },
      ])
    );
  });
});

describe("calculateMetrics - top endpoints y mas lentos", () => {
  it("topEndpoints ordena por cantidad de requests descendente", () => {
    const records = [
      ...Array.from({ length: 3 }, (_, i) => record({ id: `a${i}`, path: "/a" })),
      ...Array.from({ length: 5 }, (_, i) => record({ id: `b${i}`, path: "/b" })),
      record({ id: "c0", path: "/c" }),
    ];
    const metrics = calculateMetrics(records);
    expect(metrics.topEndpoints[0]).toEqual({ path: "/b", count: 5 });
    expect(metrics.topEndpoints[1]).toEqual({ path: "/a", count: 3 });
    expect(metrics.topEndpoints[2]).toEqual({ path: "/c", count: 1 });
  });

  it("slowestEndpoints ordena por latencia promedio descendente", () => {
    const records = [
      record({ id: "1", path: "/fast", latencyMs: 5 }),
      record({ id: "2", path: "/slow", latencyMs: 500 }),
      record({ id: "3", path: "/mid", latencyMs: 50 }),
    ];
    const metrics = calculateMetrics(records);
    expect(metrics.slowestEndpoints[0]).toEqual({ path: "/slow", avgLatencyMs: 500 });
    expect(metrics.slowestEndpoints[1]).toEqual({ path: "/mid", avgLatencyMs: 50 });
    expect(metrics.slowestEndpoints[2]).toEqual({ path: "/fast", avgLatencyMs: 5 });
  });

  it("limita top endpoints y mas lentos a 10", () => {
    const records = Array.from({ length: 15 }, (_, i) =>
      record({ id: `r${i}`, path: `/endpoint-${i}`, latencyMs: i })
    );
    const metrics = calculateMetrics(records);
    expect(metrics.topEndpoints).toHaveLength(10);
    expect(metrics.slowestEndpoints).toHaveLength(10);
  });
});

describe("getSystemInfo", () => {
  it("devuelve uptime, version y memoria con formas razonables", () => {
    const info = getSystemInfo();
    expect(typeof info.uptimeSeconds).toBe("number");
    expect(info.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof info.version).toBe("string");
    expect(info.version.length).toBeGreaterThan(0);
    expect(typeof info.memory.rss).toBe("number");
    expect(typeof info.memory.heapUsed).toBe("number");
    expect(typeof info.memory.heapTotal).toBe("number");
  });
});
