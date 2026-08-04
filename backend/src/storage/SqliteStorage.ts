import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { PerformanceConfig, SqliteStorageConfig } from "../config/types";
import type { HeaderMap, LogLevel, LogRecord, ManualLogRecord, RequestLogRecord } from "../types";
import { paginate } from "./pagination";
import type { CursorPage, QueryOptions, StorageStrategy } from "./types";

/**
 * Schema de la seccion 4.2 del PRD. Se agrega `stack_trace`, que el PRD
 * omite en la tabla pero que RF-02 si exige capturar para errores 5xx
 * (RequestLogRecord.stackTrace) -- desviacion deliberada, documentada en
 * PROGRESS.md.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  full_url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms REAL NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  request_headers TEXT,
  request_query TEXT,
  request_body TEXT,
  response_headers TEXT,
  response_body TEXT,
  response_size_bytes INTEGER,
  error_message TEXT,
  stack_trace TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_path ON requests(path ASC);
CREATE INDEX IF NOT EXISTS idx_requests_status_code ON requests(status_code ASC);
CREATE INDEX IF NOT EXISTS idx_requests_method ON requests(method ASC);
CREATE INDEX IF NOT EXISTS idx_requests_latency ON requests(latency_ms ASC);

CREATE TABLE IF NOT EXISTS manual_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  metadata TEXT,
  context TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_manual_logs_timestamp ON manual_logs(timestamp DESC);
`;

const INSERT_REQUEST_SQL = `
INSERT INTO requests (
  id, timestamp, method, path, full_url, status_code, latency_ms, client_ip,
  user_agent, request_headers, request_query, request_body, response_headers,
  response_body, response_size_bytes, error_message, stack_trace
) VALUES (
  @id, @timestamp, @method, @path, @fullUrl, @statusCode, @latencyMs, @clientIp,
  @userAgent, @requestHeaders, @requestQuery, @requestBody, @responseHeaders,
  @responseBody, @responseSizeBytes, @errorMessage, @stackTrace
)`;

const INSERT_MANUAL_SQL = `
INSERT INTO manual_logs (id, timestamp, level, message, stack_trace, metadata, context)
VALUES (@id, @timestamp, @level, @message, @stackTrace, @metadata, @context)`;

type QueuedItem =
  | { table: "requests"; record: RequestLogRecord }
  | { table: "manual_logs"; record: ManualLogRecord };

function toJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function fromJson<T>(value: string | null): T | undefined {
  return value === null ? undefined : (JSON.parse(value) as T);
}

function requestRowParams(record: RequestLogRecord) {
  return {
    id: record.id,
    timestamp: record.timestamp,
    method: record.method,
    path: record.path,
    fullUrl: record.fullUrl,
    statusCode: record.statusCode,
    latencyMs: record.latencyMs,
    clientIp: record.clientIp,
    userAgent: record.userAgent,
    requestHeaders: toJson(record.requestHeaders),
    requestQuery: toJson(record.queryParams),
    requestBody: toJson(record.requestBody),
    responseHeaders: toJson(record.responseHeaders),
    responseBody: toJson(record.responseBody),
    responseSizeBytes: record.responseSizeBytes,
    errorMessage: record.errorMessage ?? null,
    stackTrace: record.stackTrace ?? null,
  };
}

function manualRowParams(record: ManualLogRecord) {
  return {
    id: record.id,
    timestamp: record.timestamp,
    level: record.level,
    message: record.message,
    stackTrace: record.stackTrace ?? null,
    metadata: toJson(record.metadata),
    context: toJson(record.context),
  };
}

function rowToRequestLog(row: Record<string, unknown>): RequestLogRecord {
  return {
    id: row.id as string,
    type: "request",
    timestamp: row.timestamp as string,
    method: row.method as string,
    fullUrl: row.full_url as string,
    path: row.path as string,
    requestHeaders: fromJson<HeaderMap>(row.request_headers as string | null) ?? {},
    queryParams: fromJson<Record<string, unknown>>(row.request_query as string | null) ?? {},
    requestBody: fromJson(row.request_body as string | null),
    clientIp: row.client_ip as string,
    userAgent: row.user_agent as string,
    requestId: row.id as string,
    statusCode: row.status_code as number,
    responseHeaders: fromJson<HeaderMap>(row.response_headers as string | null) ?? {},
    responseBody: fromJson(row.response_body as string | null),
    latencyMs: row.latency_ms as number,
    responseSizeBytes: row.response_size_bytes as number,
    errorMessage: (row.error_message as string | null) ?? undefined,
    stackTrace: (row.stack_trace as string | null) ?? undefined,
  };
}

function rowToManualLog(row: Record<string, unknown>): ManualLogRecord {
  return {
    id: row.id as string,
    type: "manual",
    timestamp: row.timestamp as string,
    level: row.level as LogLevel,
    message: row.message as string,
    stackTrace: (row.stack_trace as string | null) ?? undefined,
    metadata: fromJson<Record<string, unknown>>(row.metadata as string | null),
    context: fromJson(row.context as string | null),
  };
}

/**
 * Storage persistente en un archivo SQLite local (RF-04.2), sin requerir
 * un servidor de base de datos. Las escrituras se acumulan en una cola en
 * memoria y se vuelcan en una sola transaccion segun `performance.*`
 * (RF-06): por tamano de batch, por intervalo de tiempo, o de inmediato si
 * `async_logging` es false. Las lecturas (getRecords/getRecordById) y
 * close() siempre flushean primero la cola pendiente, asi nunca devuelven
 * datos desactualizados.
 */
export class SqliteStorage implements StorageStrategy {
  private db!: Database.Database;
  private insertRequestStmt!: Database.Statement;
  private insertManualStmt!: Database.Statement;
  private queue: QueuedItem[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private closed = false;

  constructor(
    private readonly config: SqliteStorageConfig,
    private readonly performance: PerformanceConfig
  ) {}

  async init(): Promise<void> {
    fs.mkdirSync(path.dirname(path.resolve(this.config.databasePath)), { recursive: true });

    this.db = new Database(this.config.databasePath);
    this.db.pragma(`journal_mode = ${this.config.journalMode}`);
    this.db.pragma(`auto_vacuum = ${this.config.autoVacuum ? "FULL" : "NONE"}`);
    this.db.exec(SCHEMA_SQL);

    this.insertRequestStmt = this.db.prepare(INSERT_REQUEST_SQL);
    this.insertManualStmt = this.db.prepare(INSERT_MANUAL_SQL);

    if (this.performance.asyncLogging) {
      this.flushTimer = setInterval(() => this.flush(), this.performance.batchIntervalMs);
      this.flushTimer.unref();
    }
  }

  async saveRequestLog(record: RequestLogRecord): Promise<void> {
    this.enqueue({ table: "requests", record });
  }

  async saveManualLog(record: ManualLogRecord): Promise<void> {
    this.enqueue({ table: "manual_logs", record });
  }

  async getRecords(options: QueryOptions = {}): Promise<CursorPage<LogRecord>> {
    this.flush();
    const requests = this.db.prepare("SELECT * FROM requests").all() as Record<string, unknown>[];
    const manualLogs = this.db.prepare("SELECT * FROM manual_logs").all() as Record<string, unknown>[];
    const all: LogRecord[] = [
      ...requests.map(rowToRequestLog),
      ...manualLogs.map(rowToManualLog),
    ];
    return paginate(all, options);
  }

  async getRecordById(id: string): Promise<LogRecord | null> {
    this.flush();

    const requestRow = this.db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (requestRow) return rowToRequestLog(requestRow);

    const manualRow = this.db.prepare("SELECT * FROM manual_logs WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (manualRow) return rowToManualLog(manualRow);

    return null;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
    this.db.close();
  }

  /**
   * Encola un registro y decide si hay que volcar la cola ya: cuando se
   * llega a `batch_size`, cuando `async_logging` esta apagado (cada save
   * escribe de inmediato), o cuando agregar este item haria que la cola
   * superara `max_queue_size` (RNF-02: manejo de queue overflow).
   */
  private enqueue(item: QueuedItem): void {
    if (this.queue.length >= this.performance.maxQueueSize) {
      this.flush();
    }

    this.queue.push(item);

    if (!this.performance.asyncLogging || this.queue.length >= this.performance.batchSize) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.queue.length === 0) return;

    const pending = this.queue;
    this.queue = [];

    const runBatch = this.db.transaction((items: QueuedItem[]) => {
      for (const item of items) {
        if (item.table === "requests") {
          this.insertRequestStmt.run(requestRowParams(item.record));
        } else {
          this.insertManualStmt.run(manualRowParams(item.record));
        }
      }
    });

    try {
      runBatch(pending);
    } catch (err) {
      // RNF-02: un fallo de I/O del logger nunca debe tumbar la app anfitriona.
      console.error("[ApiScope] no se pudo escribir el batch en SQLite:", err);
    }
  }
}
