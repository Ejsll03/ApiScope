import type {
  CaptureConfig,
  MemoryStorageConfig,
  MonitoringConfig,
  PerformanceConfig,
  PostgresStorageConfig,
  RetentionConfig,
  SqliteStorageConfig,
} from "./types";

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  requestHeaders: true,
  requestBody: true,
  requestQuery: true,
  responseHeaders: true,
  responseBody: false,
  maxBodySizeKb: 100,
  excludedPaths: [],
  excludedMethods: [],
  sensitiveHeaders: ["authorization", "cookie"],
  sensitiveBodyFields: ["password", "passwd", "secret", "token"],
  maskSensitiveData: true,
};

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  endpoint: "/api/monitoring",
  enabled: true,
  cacheMetrics: true,
  cacheDurationSeconds: 30,
  pageSize: 50,
  maxPageSize: 200,
  autoRefreshInterval: 30,
  auth: {
    enabled: false,
    type: "basic",
    username: null,
    password: null,
    sessionTimeoutHours: 1,
  },
};

export const DEFAULT_MEMORY_STORAGE_CONFIG: Omit<MemoryStorageConfig, "strategy"> = {
  maxRecords: 5000,
  cleanupEnabled: true,
  cleanupIntervalMinutes: 10,
  cleanupOlderThanHours: 24,
};

export const DEFAULT_SQLITE_STORAGE_CONFIG: Omit<SqliteStorageConfig, "strategy"> = {
  databasePath: "./logs/api_logs.db",
  autoVacuum: true,
  journalMode: "WAL",
};

export const DEFAULT_POSTGRES_STORAGE_CONFIG: Omit<PostgresStorageConfig, "strategy"> = {
  host: "localhost",
  port: 5432,
  poolSize: 10,
  timeoutMs: 5000,
  ssl: false,
  autoMigrate: false,
};

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  asyncLogging: true,
  batchSize: 50,
  batchIntervalMs: 1000,
  maxQueueSize: 1000,
};

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  enabled: false,
  maxRecords: 10000,
  cleanupIntervalMinutes: 30,
  cleanupOlderThanDays: 7,
  archiveBeforeDelete: false,
  archivePath: null,
};
