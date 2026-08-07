import type { MetricsSnapshot } from "./metrics";
import type { CursorPage } from "../storage/types";
import type { LogRecord, ManualLogRecord, RequestLogRecord } from "../types";

/**
 * Serializacion HTTP de ApiScope: snake_case en el limite de la API,
 * igual criterio que logger.config.json (snake_case en JSON, camelCase en
 * TS interno). Solo se renombran los campos que definimos nosotros --
 * el contenido de request_body/response_body/metadata/request_query y las
 * claves de request_headers/response_headers viajan intactos, porque son
 * datos opacos del consumidor (o nombres reales de headers HTTP), no
 * identificadores nuestros.
 */

function toHttpRequestLog(record: RequestLogRecord) {
  return {
    id: record.id,
    type: record.type,
    timestamp: record.timestamp,
    method: record.method,
    full_url: record.fullUrl,
    path: record.path,
    request_headers: record.requestHeaders,
    request_query: record.queryParams,
    request_body: record.requestBody,
    client_ip: record.clientIp,
    user_agent: record.userAgent,
    request_id: record.requestId,
    status_code: record.statusCode,
    response_headers: record.responseHeaders,
    response_body: record.responseBody,
    latency_ms: record.latencyMs,
    response_size_bytes: record.responseSizeBytes,
    error_message: record.errorMessage,
    stack_trace: record.stackTrace,
  };
}

function toHttpManualLog(record: ManualLogRecord) {
  return {
    id: record.id,
    type: record.type,
    timestamp: record.timestamp,
    level: record.level,
    message: record.message,
    stack_trace: record.stackTrace,
    metadata: record.metadata,
    context: record.context,
  };
}

export function toHttpLogRecord(
  record: LogRecord
): ReturnType<typeof toHttpRequestLog> | ReturnType<typeof toHttpManualLog> {
  return record.type === "request" ? toHttpRequestLog(record) : toHttpManualLog(record);
}

/** RF-03: forma de response con paginacion (has_more/next_cursor/prev_cursor/total_count). */
export function toHttpPage<T extends LogRecord>(page: CursorPage<T>) {
  return {
    data: page.data.map(toHttpLogRecord),
    pagination: {
      has_more: page.pagination.hasMore,
      next_cursor: page.pagination.nextCursor,
      prev_cursor: page.pagination.prevCursor,
      total_count: page.pagination.totalCount,
    },
  };
}

export function toHttpMetrics(metrics: MetricsSnapshot) {
  return {
    requests: {
      total: metrics.requests.total,
      by_method: metrics.requests.byMethod,
      by_status: metrics.requests.byStatus,
      rate_per_minute: metrics.requests.ratePerMinute,
    },
    performance: {
      latency_avg_ms: metrics.performance.latencyAvgMs,
      latency_min_ms: metrics.performance.latencyMinMs,
      latency_max_ms: metrics.performance.latencyMaxMs,
      p50_ms: metrics.performance.p50Ms,
      p95_ms: metrics.performance.p95Ms,
      p99_ms: metrics.performance.p99Ms,
    },
    errors: {
      total_4xx: metrics.errors.total4xx,
      total_5xx: metrics.errors.total5xx,
      by_endpoint: metrics.errors.byEndpoint,
    },
    system: {
      uptime_seconds: metrics.system.uptimeSeconds,
      version: metrics.system.version,
      memory: {
        rss: metrics.system.memory.rss,
        heap_used: metrics.system.memory.heapUsed,
        heap_total: metrics.system.memory.heapTotal,
      },
    },
    top_endpoints: metrics.topEndpoints,
    slowest_endpoints: metrics.slowestEndpoints.map((entry) => ({
      path: entry.path,
      avg_latency_ms: entry.avgLatencyMs,
    })),
    timeline: metrics.timeline.map((bucket) => ({
      minute: bucket.minute,
      count: bucket.count,
      avg_latency_ms: bucket.avgLatencyMs,
    })),
  };
}
