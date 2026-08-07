import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  DEFAULT_CAPTURE_CONFIG,
  DEFAULT_MEMORY_STORAGE_CONFIG,
  DEFAULT_MONITORING_CONFIG,
  DEFAULT_PERFORMANCE_CONFIG,
  DEFAULT_POSTGRES_STORAGE_CONFIG,
  DEFAULT_RETENTION_CONFIG,
  DEFAULT_SQLITE_STORAGE_CONFIG,
} from "./defaults";
import { resolveEnvVars } from "./resolveEnvVars";
import type {
  ApiScopeConfig,
  RawApiScopeConfig,
  RawStorageSection,
  StorageConfig,
} from "./types";

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`ApiScope config error: ${message}`);
    this.name = "ConfigValidationError";
  }
}

export interface LoadConfigOptions {
  /** Ruta al logger.config.json. Default: "./logger.config.json". */
  configPath?: string;
  /** Ruta al archivo .env. Default: "./.env". */
  envPath?: string;
}

export function loadConfig(options: LoadConfigOptions = {}): ApiScopeConfig {
  const configPath = path.resolve(
    options.configPath ?? "./logger.config.json"
  );
  const envPath = path.resolve(options.envPath ?? "./.env");

  // dotenv.config() nunca sobreescribe variables que el sistema ya tenia
  // definidas, asi que el orden de prioridad (sistema > .env > defaults)
  // sale gratis con esta llamada.
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  if (!fs.existsSync(configPath)) {
    return {
      storage: { strategy: "memory", ...DEFAULT_MEMORY_STORAGE_CONFIG },
      capture: { ...DEFAULT_CAPTURE_CONFIG },
      monitoring: {
        ...DEFAULT_MONITORING_CONFIG,
        auth: { ...DEFAULT_MONITORING_CONFIG.auth },
      },
      performance: { ...DEFAULT_PERFORMANCE_CONFIG },
      retention: { ...DEFAULT_RETENTION_CONFIG },
    };
  }

  const fileContents = fs.readFileSync(configPath, "utf-8");
  let parsed: RawApiScopeConfig;
  try {
    parsed = JSON.parse(fileContents) as RawApiScopeConfig;
  } catch (cause) {
    throw new ConfigValidationError(
      `no se pudo parsear "${configPath}" como JSON valido (${
        (cause as Error).message
      }).`
    );
  }

  const resolved = resolveEnvVars(parsed);

  return buildConfig(resolved, configPath);
}

function buildConfig(
  raw: RawApiScopeConfig,
  configPath: string
): ApiScopeConfig {
  if (!raw.storage || !raw.storage.strategy) {
    throw new ConfigValidationError(
      `falta la seccion "storage" (obligatoria) en "${configPath}". ` +
        `Debe incluir al menos { "strategy": "memory" | "sqlite" | "postgresql" }.`
    );
  }

  const capture = { ...DEFAULT_CAPTURE_CONFIG, ...mapCaptureSection(raw) };
  if (capture.maxBodySizeKb <= 0) {
    throw new ConfigValidationError(
      `capture.max_body_size_kb debe ser mayor a 0 (recibido: ${capture.maxBodySizeKb}).`
    );
  }

  return {
    storage: buildStorageConfig(raw.storage),
    capture,
    monitoring: buildMonitoringConfig(raw),
    performance: buildPerformanceConfig(raw),
    retention: buildRetentionConfig(raw),
  };
}

const CONNECTION_STRING_PATTERN = /^postgres(ql)?:\/\//;

function buildStorageConfig(raw: RawStorageSection): StorageConfig {
  const cfg = raw.config ?? {};

  switch (raw.strategy) {
    case "memory": {
      const maxRecords = requireNumber(
        cfg.max_records,
        "storage.config.max_records",
        DEFAULT_MEMORY_STORAGE_CONFIG.maxRecords
      );
      requireRange(maxRecords, "storage.config.max_records", 1);

      const cleanupIntervalMinutes = requireNumber(
        cfg.cleanup_interval_minutes,
        "storage.config.cleanup_interval_minutes",
        DEFAULT_MEMORY_STORAGE_CONFIG.cleanupIntervalMinutes
      );
      requireRange(cleanupIntervalMinutes, "storage.config.cleanup_interval_minutes", 1);

      const cleanupOlderThanHours = requireNumber(
        cfg.cleanup_older_than_hours,
        "storage.config.cleanup_older_than_hours",
        DEFAULT_MEMORY_STORAGE_CONFIG.cleanupOlderThanHours
      );
      requireRange(cleanupOlderThanHours, "storage.config.cleanup_older_than_hours", 1);

      return {
        strategy: "memory",
        maxRecords,
        cleanupEnabled: requireBoolean(
          cfg.cleanup_enabled,
          "storage.config.cleanup_enabled",
          DEFAULT_MEMORY_STORAGE_CONFIG.cleanupEnabled
        ),
        cleanupIntervalMinutes,
        cleanupOlderThanHours,
      };
    }

    case "sqlite": {
      const databasePath = requireString(
        cfg.database_path,
        "storage.config.database_path",
        DEFAULT_SQLITE_STORAGE_CONFIG.databasePath
      );
      if (databasePath.trim() === "") {
        throw new ConfigValidationError(
          `storage.config.database_path no puede ser una cadena vacia cuando strategy es "sqlite".`
        );
      }
      return {
        strategy: "sqlite",
        databasePath,
        autoVacuum: requireBoolean(
          cfg.auto_vacuum,
          "storage.config.auto_vacuum",
          DEFAULT_SQLITE_STORAGE_CONFIG.autoVacuum
        ),
        journalMode: requireEnum(
          cfg.journal_mode,
          "storage.config.journal_mode",
          ["DELETE", "WAL", "MEMORY"] as const,
          DEFAULT_SQLITE_STORAGE_CONFIG.journalMode
        ),
      };
    }

    case "postgresql": {
      const connectionString = requireStringOrUndefined(
        cfg.connection_string,
        "storage.config.connection_string"
      );
      const database = requireStringOrUndefined(cfg.database, "storage.config.database");
      const user = requireStringOrUndefined(cfg.user, "storage.config.user");

      if (!connectionString && !(database && user)) {
        throw new ConfigValidationError(
          `storage.config invalido para strategy "postgresql": provee "connection_string", ` +
            `o al menos "database" y "user" (Opcion B, seccion RF-06).`
        );
      }
      if (connectionString && !CONNECTION_STRING_PATTERN.test(connectionString)) {
        throw new ConfigValidationError(
          `storage.config.connection_string debe empezar con "postgresql://" o "postgres://" ` +
            `(recibido: ${JSON.stringify(connectionString)}).`
        );
      }

      const port = requireNumber(
        cfg.port,
        "storage.config.port",
        DEFAULT_POSTGRES_STORAGE_CONFIG.port
      );
      requireRange(port, "storage.config.port", 1, 65535);

      const poolSize = requireNumber(
        cfg.pool_size,
        "storage.config.pool_size",
        DEFAULT_POSTGRES_STORAGE_CONFIG.poolSize
      );
      requireRange(poolSize, "storage.config.pool_size", 1);

      const timeoutMs = requireNumber(
        cfg.timeout_ms,
        "storage.config.timeout_ms",
        DEFAULT_POSTGRES_STORAGE_CONFIG.timeoutMs
      );
      requireRange(timeoutMs, "storage.config.timeout_ms", 1);

      return {
        strategy: "postgresql",
        connectionString,
        host: requireString(cfg.host, "storage.config.host", DEFAULT_POSTGRES_STORAGE_CONFIG.host),
        port,
        database,
        user,
        password: requireStringOrUndefined(cfg.password, "storage.config.password"),
        poolSize,
        timeoutMs,
        ssl: requireBoolean(cfg.ssl, "storage.config.ssl", DEFAULT_POSTGRES_STORAGE_CONFIG.ssl),
        autoMigrate: requireBoolean(
          cfg.auto_migrate,
          "storage.config.auto_migrate",
          DEFAULT_POSTGRES_STORAGE_CONFIG.autoMigrate
        ),
      };
    }

    default:
      throw new ConfigValidationError(
        `storage.strategy "${String(
          raw.strategy
        )}" invalida. Usa "memory", "sqlite" o "postgresql".`
      );
  }
}

function mapCaptureSection(raw: RawApiScopeConfig) {
  const c = raw.capture ?? {};
  const d = DEFAULT_CAPTURE_CONFIG;
  return {
    ...(c.request_headers !== undefined && {
      requestHeaders: requireBoolean(c.request_headers, "capture.request_headers", d.requestHeaders),
    }),
    ...(c.request_body !== undefined && {
      requestBody: requireBoolean(c.request_body, "capture.request_body", d.requestBody),
    }),
    ...(c.request_query !== undefined && {
      requestQuery: requireBoolean(c.request_query, "capture.request_query", d.requestQuery),
    }),
    ...(c.response_headers !== undefined && {
      responseHeaders: requireBoolean(
        c.response_headers,
        "capture.response_headers",
        d.responseHeaders
      ),
    }),
    ...(c.response_body !== undefined && {
      responseBody: requireBoolean(c.response_body, "capture.response_body", d.responseBody),
    }),
    ...(c.max_body_size_kb !== undefined && {
      maxBodySizeKb: requireNumber(c.max_body_size_kb, "capture.max_body_size_kb", d.maxBodySizeKb),
    }),
    ...(c.excluded_paths !== undefined && {
      excludedPaths: requireStringArray(c.excluded_paths, "capture.excluded_paths", d.excludedPaths),
    }),
    ...(c.excluded_methods !== undefined && {
      excludedMethods: requireStringArray(
        c.excluded_methods,
        "capture.excluded_methods",
        d.excludedMethods
      ),
    }),
    ...(c.sensitive_headers !== undefined && {
      sensitiveHeaders: requireStringArray(
        c.sensitive_headers,
        "capture.sensitive_headers",
        d.sensitiveHeaders
      ),
    }),
    ...(c.sensitive_body_fields !== undefined && {
      sensitiveBodyFields: requireStringArray(
        c.sensitive_body_fields,
        "capture.sensitive_body_fields",
        d.sensitiveBodyFields
      ),
    }),
    ...(c.mask_sensitive_data !== undefined && {
      maskSensitiveData: requireBoolean(
        c.mask_sensitive_data,
        "capture.mask_sensitive_data",
        d.maskSensitiveData
      ),
    }),
  };
}

function buildMonitoringConfig(raw: RawApiScopeConfig) {
  const m = raw.monitoring ?? {};
  const authRaw = m.auth ?? {};
  const d = DEFAULT_MONITORING_CONFIG;

  const sessionTimeoutHours = requireNumber(
    authRaw.session_timeout_hours,
    "monitoring.auth.session_timeout_hours",
    d.auth.sessionTimeoutHours
  );
  requireRange(sessionTimeoutHours, "monitoring.auth.session_timeout_hours", 1);

  const auth = {
    enabled: requireBoolean(authRaw.enabled, "monitoring.auth.enabled", d.auth.enabled),
    type: requireEnum(authRaw.type, "monitoring.auth.type", ["basic"] as const, "basic"),
    username: authRaw.username ?? d.auth.username,
    password: authRaw.password ?? d.auth.password,
    sessionTimeoutHours,
  };

  if (auth.enabled && (!auth.username || !auth.password)) {
    throw new ConfigValidationError(
      `monitoring.auth.enabled es true pero falta "username" y/o "password".`
    );
  }

  const pageSize = requireNumber(m.page_size, "monitoring.page_size", d.pageSize);
  const maxPageSize = requireNumber(m.max_page_size, "monitoring.max_page_size", d.maxPageSize);

  if (pageSize > maxPageSize) {
    throw new ConfigValidationError(
      `monitoring.page_size (${pageSize}) no puede ser mayor que monitoring.max_page_size (${maxPageSize}).`
    );
  }

  const endpoint = requireString(m.endpoint, "monitoring.endpoint", d.endpoint);
  if (!endpoint.startsWith("/")) {
    throw new ConfigValidationError(
      `monitoring.endpoint debe empezar con "/" (recibido: ${JSON.stringify(endpoint)}).`
    );
  }

  const cacheDurationSeconds = requireNumber(
    m.cache_duration_seconds,
    "monitoring.cache_duration_seconds",
    d.cacheDurationSeconds
  );
  requireRange(cacheDurationSeconds, "monitoring.cache_duration_seconds", 0);

  const autoRefreshInterval = requireNumber(
    m.auto_refresh_interval,
    "monitoring.auto_refresh_interval",
    d.autoRefreshInterval
  );
  requireRange(autoRefreshInterval, "monitoring.auto_refresh_interval", 5, 300);

  return {
    endpoint,
    enabled: requireBoolean(m.enabled, "monitoring.enabled", d.enabled),
    cacheMetrics: requireBoolean(m.cache_metrics, "monitoring.cache_metrics", d.cacheMetrics),
    cacheDurationSeconds,
    pageSize,
    maxPageSize,
    autoRefreshInterval,
    auth,
  };
}

function buildPerformanceConfig(raw: RawApiScopeConfig) {
  const p = raw.performance ?? {};
  const d = DEFAULT_PERFORMANCE_CONFIG;

  const batchSize = requireNumber(p.batch_size, "performance.batch_size", d.batchSize);
  const batchIntervalMs = requireNumber(
    p.batch_interval_ms,
    "performance.batch_interval_ms",
    d.batchIntervalMs
  );
  const maxQueueSize = requireNumber(
    p.max_queue_size,
    "performance.max_queue_size",
    d.maxQueueSize
  );

  requireRange(batchSize, "performance.batch_size", 1);
  requireRange(batchIntervalMs, "performance.batch_interval_ms", 1);
  requireRange(maxQueueSize, "performance.max_queue_size", 1);

  if (batchSize > maxQueueSize) {
    throw new ConfigValidationError(
      `performance.batch_size (${batchSize}) no puede ser mayor que performance.max_queue_size (${maxQueueSize}).`
    );
  }

  return {
    asyncLogging: requireBoolean(p.async_logging, "performance.async_logging", d.asyncLogging),
    batchSize,
    batchIntervalMs,
    maxQueueSize,
  };
}

function buildRetentionConfig(raw: RawApiScopeConfig) {
  const r = raw.retention ?? {};
  const d = DEFAULT_RETENTION_CONFIG;

  const maxRecords = requireNumber(r.max_records, "retention.max_records", d.maxRecords);
  requireRange(maxRecords, "retention.max_records", 1);

  const cleanupIntervalMinutes = requireNumber(
    r.cleanup_interval_minutes,
    "retention.cleanup_interval_minutes",
    d.cleanupIntervalMinutes
  );
  requireRange(cleanupIntervalMinutes, "retention.cleanup_interval_minutes", 1);

  const cleanupOlderThanDays = requireNumber(
    r.cleanup_older_than_days,
    "retention.cleanup_older_than_days",
    d.cleanupOlderThanDays
  );
  requireRange(cleanupOlderThanDays, "retention.cleanup_older_than_days", 1);

  const archiveBeforeDelete = requireBoolean(
    r.archive_before_delete,
    "retention.archive_before_delete",
    d.archiveBeforeDelete
  );
  const archivePath = r.archive_path ?? d.archivePath;

  if (archiveBeforeDelete && !archivePath) {
    throw new ConfigValidationError(
      `retention.archive_before_delete es true pero falta "archive_path".`
    );
  }

  return {
    enabled: requireBoolean(r.enabled, "retention.enabled", d.enabled),
    maxRecords,
    cleanupIntervalMinutes,
    cleanupOlderThanDays,
    archiveBeforeDelete,
    archivePath,
  };
}

/**
 * Distingue "campo ausente" (usa el default) de "campo presente con tipo
 * incorrecto" (falla al arranque, RF-06). Una vez que el JSON trae un valor
 * para el campo, se exige que tenga el tipo correcto -- ya no se cae en
 * silencio al default.
 */
function requireNumber(value: unknown, fieldPath: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ConfigValidationError(
      `${fieldPath} debe ser un numero (recibido: ${JSON.stringify(value)}).`
    );
  }
  return value;
}

function requireBoolean(value: unknown, fieldPath: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new ConfigValidationError(
      `${fieldPath} debe ser boolean (recibido: ${JSON.stringify(value)}).`
    );
  }
  return value;
}

function requireString(value: unknown, fieldPath: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    throw new ConfigValidationError(
      `${fieldPath} debe ser un string (recibido: ${JSON.stringify(value)}).`
    );
  }
  return value;
}

function requireStringOrUndefined(value: unknown, fieldPath: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ConfigValidationError(
      `${fieldPath} debe ser un string (recibido: ${JSON.stringify(value)}).`
    );
  }
  return value;
}

function requireStringArray(value: unknown, fieldPath: string, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new ConfigValidationError(
      `${fieldPath} debe ser un array de strings (recibido: ${JSON.stringify(value)}).`
    );
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  fieldPath: string,
  allowed: readonly T[],
  fallback: T
): T {
  if (value === undefined) return fallback;
  if (!allowed.includes(value as T)) {
    throw new ConfigValidationError(
      `${fieldPath} debe ser uno de [${allowed.join(", ")}] (recibido: ${JSON.stringify(value)}).`
    );
  }
  return value as T;
}

function requireRange(value: number, fieldPath: string, min: number, max?: number): void {
  if (value < min || (max !== undefined && value > max)) {
    throw new ConfigValidationError(
      `${fieldPath} debe estar entre ${min} y ${
        max ?? "sin limite"
      } (recibido: ${value}).`
    );
  }
}
