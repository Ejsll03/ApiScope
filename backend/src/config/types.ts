/**
 * Formas de configuracion. Separamos dos capas:
 *  - Raw*: como luce el JSON tal cual lo escribe el usuario (snake_case,
 *    todo opcional porque puede faltar y se rellena con defaults).
 *  - Config (sin prefijo): la version ya resuelta que usa el resto del
 *    codigo internamente (camelCase, campos obligatorios).
 */

export type StorageStrategyName = "memory" | "sqlite" | "postgresql";

export interface RawMemoryStorageConfig {
  max_records?: number;
  cleanup_enabled?: boolean;
  cleanup_interval_minutes?: number;
  cleanup_older_than_hours?: number;
}

export interface RawStorageSection {
  strategy: StorageStrategyName;
  config?: Record<string, unknown>;
}

export interface RawCaptureSection {
  request_headers?: boolean;
  request_body?: boolean;
  request_query?: boolean;
  response_headers?: boolean;
  response_body?: boolean;
  max_body_size_kb?: number;
  excluded_paths?: string[];
  excluded_methods?: string[];
  sensitive_headers?: string[];
  /** Campos de body a enmascarar por nombre (case-insensitive). Ver politica de seguridad en CLAUDE.md. */
  sensitive_body_fields?: string[];
  mask_sensitive_data?: boolean;
}

export interface RawMonitoringAuthSection {
  enabled?: boolean;
  type?: "basic";
  username?: string | null;
  password?: string | null;
  session_timeout_hours?: number;
}

export interface RawMonitoringSection {
  endpoint?: string;
  enabled?: boolean;
  cache_metrics?: boolean;
  cache_duration_seconds?: number;
  page_size?: number;
  max_page_size?: number;
  auto_refresh_interval?: number;
  auth?: RawMonitoringAuthSection;
}

export interface RawPerformanceSection {
  async_logging?: boolean;
  batch_size?: number;
  batch_interval_ms?: number;
  max_queue_size?: number;
}

/** Shape completo del archivo logger.config.json, tal como lo escribe el usuario. */
export interface RawApiScopeConfig {
  storage: RawStorageSection;
  capture?: RawCaptureSection;
  monitoring?: RawMonitoringSection;
  performance?: RawPerformanceSection;
}

// ---- Config resuelta (con defaults aplicados) ----

export interface MemoryStorageConfig {
  strategy: "memory";
  maxRecords: number;
  cleanupEnabled: boolean;
  cleanupIntervalMinutes: number;
  cleanupOlderThanHours: number;
}

export interface SqliteStorageConfig {
  strategy: "sqlite";
  databasePath: string;
  autoVacuum: boolean;
  journalMode: "DELETE" | "WAL" | "MEMORY";
}

export interface PostgresStorageConfig {
  strategy: "postgresql";
  connectionString?: string;
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  poolSize: number;
  timeoutMs: number;
  ssl: boolean;
  autoMigrate: boolean;
}

/**
 * Union discriminada por `strategy`. El StorageFactory (fase 2/3) usara
 * este campo para decidir que clase instanciar.
 */
export type StorageConfig =
  | MemoryStorageConfig
  | SqliteStorageConfig
  | PostgresStorageConfig;

export interface CaptureConfig {
  requestHeaders: boolean;
  requestBody: boolean;
  requestQuery: boolean;
  responseHeaders: boolean;
  responseBody: boolean;
  maxBodySizeKb: number;
  excludedPaths: string[];
  excludedMethods: string[];
  sensitiveHeaders: string[];
  sensitiveBodyFields: string[];
  maskSensitiveData: boolean;
}

export interface MonitoringAuthConfig {
  enabled: boolean;
  type: "basic";
  username: string | null;
  password: string | null;
  sessionTimeoutHours: number;
}

export interface MonitoringConfig {
  endpoint: string;
  enabled: boolean;
  cacheMetrics: boolean;
  cacheDurationSeconds: number;
  pageSize: number;
  maxPageSize: number;
  autoRefreshInterval: number;
  auth: MonitoringAuthConfig;
}

/**
 * Optimizaciones de rendimiento (RF-06, seccion Performance). Usado hoy
 * por SqliteStorage para batchear escrituras dentro de una transaccion;
 * MemoryStorage lo ignora porque ya escribe en RAM sin I/O.
 */
export interface PerformanceConfig {
  asyncLogging: boolean;
  batchSize: number;
  batchIntervalMs: number;
  maxQueueSize: number;
}

export interface ApiScopeConfig {
  storage: StorageConfig;
  capture: CaptureConfig;
  monitoring: MonitoringConfig;
  performance: PerformanceConfig;
}
