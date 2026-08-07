import fs from "node:fs";
import path from "node:path";
import type { RequestLogRecord } from "../types";

export interface SystemInfo {
  uptimeSeconds: number;
  version: string;
  memory: { rss: number; heapUsed: number; heapTotal: number };
}

/** Un minuto de la ventana de tiempo del dashboard (RF-03: "Timeline de Requests", "Performance"). */
export interface TimelineBucket {
  minute: string;
  count: number;
  avgLatencyMs: number;
}

export interface MetricsSnapshot {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: { "2xx": number; "3xx": number; "4xx": number; "5xx": number };
    ratePerMinute: number;
  };
  performance: {
    latencyAvgMs: number;
    latencyMinMs: number;
    latencyMaxMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  errors: {
    total4xx: number;
    total5xx: number;
    byEndpoint: Array<{ path: string; count: number }>;
  };
  system: SystemInfo;
  topEndpoints: Array<{ path: string; count: number }>;
  slowestEndpoints: Array<{ path: string; avgLatencyMs: number }>;
  /** Series por minuto de los ultimos `windowMinutes` (default 60), mas vieja primero. */
  timeline: TimelineBucket[];
}

const TOP_N = 10;
const RATE_WINDOW_MS = 60_000;
const TIMELINE_WINDOW_MINUTES = 60;
const MINUTE_MS = 60_000;

function floorToMinute(date: Date): number {
  return Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS;
}

/**
 * Arma una serie de un punto por minuto (ventana fija, huecos en 0) para
 * los graficos de linea del dashboard -- RF-03 pide "Requests por minuto
 * en ultimas horas" y "Latencia promedio en el tiempo", pero el JSON de
 * metricas del PRD (seccion "Metricas en Tiempo Real") no define un campo
 * para eso: se agrega `timeline` como extension aditiva (MINOR, no rompe
 * el contrato existente).
 */
function buildTimeline(
  records: RequestLogRecord[],
  now: Date,
  windowMinutes = TIMELINE_WINDOW_MINUTES
): TimelineBucket[] {
  const nowMinute = floorToMinute(now);
  const startMinute = nowMinute - (windowMinutes - 1) * MINUTE_MS;

  const buckets = new Map<number, { count: number; latencySum: number }>();
  for (let t = startMinute; t <= nowMinute; t += MINUTE_MS) {
    buckets.set(t, { count: 0, latencySum: 0 });
  }

  for (const record of records) {
    const bucket = buckets.get(floorToMinute(new Date(record.timestamp)));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.latencySum += record.latencyMs;
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, { count, latencySum }]) => ({
      minute: new Date(t).toISOString(),
      count,
      avgLatencyMs: count > 0 ? latencySum / count : 0,
    }));
}

function statusBucket(statusCode: number): "2xx" | "3xx" | "4xx" | "5xx" | null {
  const bucket = Math.floor(statusCode / 100);
  if (bucket >= 2 && bucket <= 5) return `${bucket}xx` as "2xx" | "3xx" | "4xx" | "5xx";
  return null;
}

/** Percentil por "nearest-rank": ordena ascendente y redondea hacia arriba la posicion. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.min(Math.max(index, 0), sortedAsc.length - 1)];
}

function groupCountByPath(records: RequestLogRecord[]): Array<{ path: string; count: number }> {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.path, (counts.get(record.path) ?? 0) + 1);
  }
  return [...counts.entries()].map(([recordPath, count]) => ({ path: recordPath, count }));
}

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "../../package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Info de sistema (RF-03: "Sistema | Uptime, versión, memoria, CPU (opcional)" -- CPU se omite). */
export function getSystemInfo(): SystemInfo {
  const memoryUsage = process.memoryUsage();
  return {
    uptimeSeconds: Math.round(process.uptime()),
    version: readPackageVersion(),
    memory: {
      rss: memoryUsage.rss,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
    },
  };
}

/**
 * Calcula las metricas agregadas del endpoint `/api/monitoring/metrics`
 * (RF-03) a partir de TODOS los RequestLogRecord (sin paginar --
 * StorageStrategy.getAllRequestLogs()). `now`/`systemInfo` son
 * inyectables para tests deterministas; en produccion el router los deja
 * en su default (Date actual / proceso actual).
 */
export function calculateMetrics(
  records: RequestLogRecord[],
  options: { now?: Date; systemInfo?: SystemInfo } = {}
): MetricsSnapshot {
  const now = options.now ?? new Date();
  const system = options.systemInfo ?? getSystemInfo();

  const byMethod: Record<string, number> = {};
  const byStatus = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  let ratePerMinute = 0;
  let total4xx = 0;
  let total5xx = 0;
  const errorRecords: RequestLogRecord[] = [];
  const latencies: number[] = [];

  for (const record of records) {
    byMethod[record.method] = (byMethod[record.method] ?? 0) + 1;

    const bucket = statusBucket(record.statusCode);
    if (bucket) byStatus[bucket] += 1;
    if (record.statusCode >= 400 && record.statusCode < 500) total4xx += 1;
    if (record.statusCode >= 500) total5xx += 1;
    if (record.statusCode >= 400) errorRecords.push(record);

    if (now.getTime() - new Date(record.timestamp).getTime() <= RATE_WINDOW_MS) {
      ratePerMinute += 1;
    }

    latencies.push(record.latencyMs);
  }

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const latencySum = latencies.reduce((sum, ms) => sum + ms, 0);

  const latencyByPath = new Map<string, number[]>();
  for (const record of records) {
    const list = latencyByPath.get(record.path) ?? [];
    list.push(record.latencyMs);
    latencyByPath.set(record.path, list);
  }
  const slowestEndpoints = [...latencyByPath.entries()]
    .map(([recordPath, values]) => ({
      path: recordPath,
      avgLatencyMs: values.reduce((sum, ms) => sum + ms, 0) / values.length,
    }))
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, TOP_N);

  const topEndpoints = groupCountByPath(records)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  const errorsByEndpoint = groupCountByPath(errorRecords);

  return {
    requests: {
      total: records.length,
      byMethod,
      byStatus,
      ratePerMinute,
    },
    performance: {
      latencyAvgMs: latencies.length > 0 ? latencySum / latencies.length : 0,
      latencyMinMs: sortedLatencies[0] ?? 0,
      latencyMaxMs: sortedLatencies[sortedLatencies.length - 1] ?? 0,
      p50Ms: percentile(sortedLatencies, 50),
      p95Ms: percentile(sortedLatencies, 95),
      p99Ms: percentile(sortedLatencies, 99),
    },
    errors: {
      total4xx,
      total5xx,
      byEndpoint: errorsByEndpoint,
    },
    system,
    topEndpoints,
    slowestEndpoints,
    timeline: buildTimeline(records, now),
  };
}
