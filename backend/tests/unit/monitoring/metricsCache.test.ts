import { describe, expect, it, vi } from "vitest";
import type { MonitoringConfig } from "../../../src/config/types";
import { createMetricsCache } from "../../../src/monitoring/metricsCache";
import type { CursorPage, QueryOptions, StorageStrategy } from "../../../src/storage/types";
import type { LogRecord, RequestLogRecord } from "../../../src/types";

function monitoringConfig(overrides: Partial<MonitoringConfig> = {}): MonitoringConfig {
  return {
    endpoint: "/api/monitoring",
    enabled: true,
    cacheMetrics: true,
    cacheDurationSeconds: 30,
    pageSize: 50,
    maxPageSize: 200,
    autoRefreshInterval: 30,
    auth: { enabled: false, type: "basic", username: null, password: null, sessionTimeoutHours: 1 },
    ...overrides,
  };
}

function createCountingStorage(): StorageStrategy & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async init() {},
    async saveRequestLog() {},
    async saveManualLog() {},
    async getRecords(_options?: QueryOptions): Promise<CursorPage<LogRecord>> {
      return { data: [], pagination: { hasMore: false, nextCursor: null, prevCursor: null, totalCount: 0 } };
    },
    async getRecordById() {
      return null;
    },
    async getAllRequestLogs(): Promise<RequestLogRecord[]> {
      state.calls += 1;
      return [];
    },
    async close() {},
  };
}

describe("createMetricsCache", () => {
  it("recalcula en cada llamada si cacheMetrics es false", async () => {
    const storage = createCountingStorage();
    const getMetrics = createMetricsCache(storage, monitoringConfig({ cacheMetrics: false }));

    await getMetrics();
    await getMetrics();

    expect(storage.calls).toBe(2);
  });

  it("reusa el resultado cacheado dentro de cache_duration_seconds", async () => {
    const storage = createCountingStorage();
    const getMetrics = createMetricsCache(storage, monitoringConfig({ cacheMetrics: true, cacheDurationSeconds: 30 }));

    await getMetrics();
    await getMetrics();
    await getMetrics();

    expect(storage.calls).toBe(1);
  });

  it("recalcula una vez vencido cache_duration_seconds", async () => {
    vi.useFakeTimers();
    try {
      const storage = createCountingStorage();
      const getMetrics = createMetricsCache(storage, monitoringConfig({ cacheMetrics: true, cacheDurationSeconds: 30 }));

      await getMetrics();
      vi.advanceTimersByTime(31_000);
      await getMetrics();

      expect(storage.calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
