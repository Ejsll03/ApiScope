import { Pool, type PoolConfig } from "pg";
import { runMigrations, validateConnection } from "../migrations/runMigrations";
import type { PerformanceConfig, PostgresStorageConfig } from "../config/types";
import type { HeaderMap, LogLevel, LogRecord, ManualLogRecord, RequestLogRecord } from "../types";
import { paginate } from "./pagination";
import type { CursorPage, QueryOptions, StorageStrategy } from "./types";

const INSERT_REQUEST_SQL = `
INSERT INTO requests (
  id, timestamp, method, path, full_url, status_code, latency_ms, client_ip,
  user_agent, request_headers, request_query, request_body, response_headers,
  response_body, response_size_bytes, error_message, stack_trace
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`;

const INSERT_MANUAL_SQL = `
INSERT INTO manual_logs (id, timestamp, level, message, stack_trace, metadata, context)
VALUES ($1, $2, $3, $4, $5, $6, $7)`;

type QueuedItem =
  | { table: "requests"; record: RequestLogRecord }
  | { table: "manual_logs"; record: ManualLogRecord };

function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function requestRowParams(record: RequestLogRecord): unknown[] {
  return [
    record.id,
    record.timestamp,
    record.method,
    record.path,
    record.fullUrl,
    record.statusCode,
    record.latencyMs,
    record.clientIp,
    record.userAgent,
    record.requestHeaders,
    record.queryParams,
    record.requestBody ?? null,
    record.responseHeaders,
    record.responseBody ?? null,
    record.responseSizeBytes,
    record.errorMessage ?? null,
    record.stackTrace ?? null,
  ];
}

function manualRowParams(record: ManualLogRecord): unknown[] {
  return [
    record.id,
    record.timestamp,
    record.level,
    record.message,
    record.stackTrace ?? null,
    record.metadata ?? null,
    record.context ?? null,
  ];
}

/** pg parsea columnas timestamptz como Date; el resto del paquete usa ISO 8601 string. */
function toIso(value: Date): string {
  return value.toISOString();
}

function rowToRequestLog(row: Record<string, unknown>): RequestLogRecord {
  return {
    id: row.id as string,
    type: "request",
    timestamp: toIso(row.timestamp as Date),
    method: row.method as string,
    fullUrl: row.full_url as string,
    path: row.path as string,
    requestHeaders: (row.request_headers as HeaderMap) ?? {},
    queryParams: (row.request_query as Record<string, unknown>) ?? {},
    requestBody: nullToUndefined(row.request_body as unknown | null),
    clientIp: row.client_ip as string,
    userAgent: row.user_agent as string,
    requestId: row.id as string,
    statusCode: row.status_code as number,
    responseHeaders: (row.response_headers as HeaderMap) ?? {},
    responseBody: nullToUndefined(row.response_body as unknown | null),
    latencyMs: row.latency_ms as number,
    responseSizeBytes: row.response_size_bytes as number,
    errorMessage: nullToUndefined(row.error_message as string | null),
    stackTrace: nullToUndefined(row.stack_trace as string | null),
  };
}

function rowToManualLog(row: Record<string, unknown>): ManualLogRecord {
  return {
    id: row.id as string,
    type: "manual",
    timestamp: toIso(row.timestamp as Date),
    level: row.level as LogLevel,
    message: row.message as string,
    stackTrace: nullToUndefined(row.stack_trace as string | null),
    metadata: nullToUndefined(row.metadata as Record<string, unknown> | null),
    context: nullToUndefined(row.context as ManualLogRecord["context"] | null),
  };
}

/** Exportada para reutilizarse desde scripts/migrate.ts (mismo mapeo config -> PoolConfig). */
export function buildPoolConfig(config: PostgresStorageConfig): PoolConfig {
  const base: PoolConfig = {
    max: config.poolSize,
    connectionTimeoutMillis: config.timeoutMs,
    ssl: config.ssl,
  };

  if (config.connectionString) {
    return { ...base, connectionString: config.connectionString };
  }

  return {
    ...base,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  };
}

/**
 * Storage de produccion contra un servidor PostgreSQL (RF-04.3): pool de
 * conexiones, schema JSONB con migrations versionadas
 * (src/migrations/001_init.sql), y el mismo patron de batching por cola +
 * transaccion que SqliteStorage, adaptado a las llamadas async de `pg`.
 *
 * A diferencia de SqliteStorage, el schema NO se crea automaticamente salvo
 * que `storage.config.auto_migrate` sea true (RF-06) -- en produccion se
 * espera correr las migrations a mano con `npm run migrate` (ver
 * scripts/migrate.ts) antes de levantar la app.
 */
export class PostgresStorage implements StorageStrategy {
  private pool!: Pool;
  private queue: QueuedItem[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private closed = false;

  constructor(
    private readonly config: PostgresStorageConfig,
    private readonly performance: PerformanceConfig
  ) {}

  async init(): Promise<void> {
    this.pool = new Pool(buildPoolConfig(this.config));
    // RNF-02: un error async del pool (ej. se cae una conexion idle) no
    // debe tumbar el proceso -- pg emite 'error' en ese caso y Node mata el
    // proceso si nadie escucha ese evento.
    this.pool.on("error", (err) => {
      console.error("[ApiScope] error inesperado en el pool de PostgreSQL:", err);
    });

    await validateConnection(this.pool);

    if (this.config.autoMigrate) {
      await runMigrations(this.pool);
    }

    if (this.performance.asyncLogging) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          console.error("[ApiScope] fallo el flush periodico a PostgreSQL:", err);
        });
      }, this.performance.batchIntervalMs);
      this.flushTimer.unref();
    }
  }

  async saveRequestLog(record: RequestLogRecord): Promise<void> {
    await this.enqueue({ table: "requests", record });
  }

  async saveManualLog(record: ManualLogRecord): Promise<void> {
    await this.enqueue({ table: "manual_logs", record });
  }

  async getRecords(options: QueryOptions = {}): Promise<CursorPage<LogRecord>> {
    await this.flush();
    const requests = await this.pool.query("SELECT * FROM requests");
    const manualLogs = await this.pool.query("SELECT * FROM manual_logs");
    const all: LogRecord[] = [
      ...requests.rows.map(rowToRequestLog),
      ...manualLogs.rows.map(rowToManualLog),
    ];
    return paginate(all, options);
  }

  async getRecordById(id: string): Promise<LogRecord | null> {
    await this.flush();

    const requestRes = await this.pool.query("SELECT * FROM requests WHERE id = $1", [id]);
    if (requestRes.rows[0]) return rowToRequestLog(requestRes.rows[0]);

    const manualRes = await this.pool.query("SELECT * FROM manual_logs WHERE id = $1", [id]);
    if (manualRes.rows[0]) return rowToManualLog(manualRes.rows[0]);

    return null;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
    await this.pool.end();
  }

  /**
   * Igual criterio que SqliteStorage.enqueue(): flushea cuando se llega a
   * `batch_size`, cuando `async_logging` esta apagado, o cuando agregar
   * este item haria que la cola superara `max_queue_size` (RNF-02).
   */
  private async enqueue(item: QueuedItem): Promise<void> {
    if (this.queue.length >= this.performance.maxQueueSize) {
      await this.flush();
    }

    this.queue.push(item);

    if (!this.performance.asyncLogging || this.queue.length >= this.performance.batchSize) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const pending = this.queue;
    this.queue = [];

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of pending) {
        if (item.table === "requests") {
          await client.query(INSERT_REQUEST_SQL, requestRowParams(item.record));
        } else {
          await client.query(INSERT_MANUAL_SQL, manualRowParams(item.record));
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // RNF-02: un fallo de I/O del logger nunca debe tumbar la app anfitriona.
      console.error("[ApiScope] no se pudo escribir el batch en PostgreSQL:", err);
    } finally {
      client.release();
    }
  }
}
