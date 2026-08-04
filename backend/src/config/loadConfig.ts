import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  DEFAULT_CAPTURE_CONFIG,
  DEFAULT_MEMORY_STORAGE_CONFIG,
  DEFAULT_MONITORING_CONFIG,
  DEFAULT_PERFORMANCE_CONFIG,
  DEFAULT_POSTGRES_STORAGE_CONFIG,
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
  };
}

function buildStorageConfig(raw: RawStorageSection): StorageConfig {
  const cfg = raw.config ?? {};

  switch (raw.strategy) {
    case "memory":
      return {
        strategy: "memory",
        maxRecords: numberOr(cfg.max_records, DEFAULT_MEMORY_STORAGE_CONFIG.maxRecords),
        cleanupEnabled: boolOr(
          cfg.cleanup_enabled,
          DEFAULT_MEMORY_STORAGE_CONFIG.cleanupEnabled
        ),
        cleanupIntervalMinutes: numberOr(
          cfg.cleanup_interval_minutes,
          DEFAULT_MEMORY_STORAGE_CONFIG.cleanupIntervalMinutes
        ),
        cleanupOlderThanHours: numberOr(
          cfg.cleanup_older_than_hours,
          DEFAULT_MEMORY_STORAGE_CONFIG.cleanupOlderThanHours
        ),
      };

    case "sqlite": {
      const databasePath = stringOr(
        cfg.database_path,
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
        autoVacuum: boolOr(cfg.auto_vacuum, DEFAULT_SQLITE_STORAGE_CONFIG.autoVacuum),
        journalMode: journalModeOr(
          cfg.journal_mode,
          DEFAULT_SQLITE_STORAGE_CONFIG.journalMode
        ),
      };
    }

    case "postgresql": {
      const connectionString = stringOrUndefined(cfg.connection_string);
      const database = stringOrUndefined(cfg.database);
      const user = stringOrUndefined(cfg.user);

      if (!connectionString && !(database && user)) {
        throw new ConfigValidationError(
          `storage.config invalido para strategy "postgresql": provee "connection_string", ` +
            `o al menos "database" y "user" (Opcion B, seccion RF-06).`
        );
      }

      return {
        strategy: "postgresql",
        connectionString,
        host: stringOr(cfg.host, DEFAULT_POSTGRES_STORAGE_CONFIG.host),
        port: numberOr(cfg.port, DEFAULT_POSTGRES_STORAGE_CONFIG.port),
        database,
        user,
        password: stringOrUndefined(cfg.password),
        poolSize: numberOr(cfg.pool_size, DEFAULT_POSTGRES_STORAGE_CONFIG.poolSize),
        timeoutMs: numberOr(cfg.timeout_ms, DEFAULT_POSTGRES_STORAGE_CONFIG.timeoutMs),
        ssl: boolOr(cfg.ssl, DEFAULT_POSTGRES_STORAGE_CONFIG.ssl),
        autoMigrate: boolOr(
          cfg.auto_migrate,
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
  return {
    ...(c.request_headers !== undefined && { requestHeaders: c.request_headers }),
    ...(c.request_body !== undefined && { requestBody: c.request_body }),
    ...(c.request_query !== undefined && { requestQuery: c.request_query }),
    ...(c.response_headers !== undefined && { responseHeaders: c.response_headers }),
    ...(c.response_body !== undefined && { responseBody: c.response_body }),
    ...(c.max_body_size_kb !== undefined && { maxBodySizeKb: c.max_body_size_kb }),
    ...(c.excluded_paths !== undefined && { excludedPaths: c.excluded_paths }),
    ...(c.excluded_methods !== undefined && { excludedMethods: c.excluded_methods }),
    ...(c.sensitive_headers !== undefined && { sensitiveHeaders: c.sensitive_headers }),
    ...(c.sensitive_body_fields !== undefined && {
      sensitiveBodyFields: c.sensitive_body_fields,
    }),
    ...(c.mask_sensitive_data !== undefined && {
      maskSensitiveData: c.mask_sensitive_data,
    }),
  };
}

function buildMonitoringConfig(raw: RawApiScopeConfig) {
  const m = raw.monitoring ?? {};
  const authRaw = m.auth ?? {};

  const auth = {
    enabled: boolOr(authRaw.enabled, DEFAULT_MONITORING_CONFIG.auth.enabled),
    type: "basic" as const,
    username: authRaw.username ?? DEFAULT_MONITORING_CONFIG.auth.username,
    password: authRaw.password ?? DEFAULT_MONITORING_CONFIG.auth.password,
    sessionTimeoutHours: numberOr(
      authRaw.session_timeout_hours,
      DEFAULT_MONITORING_CONFIG.auth.sessionTimeoutHours
    ),
  };

  if (auth.enabled && (!auth.username || !auth.password)) {
    throw new ConfigValidationError(
      `monitoring.auth.enabled es true pero falta "username" y/o "password".`
    );
  }

  const pageSize = numberOr(m.page_size, DEFAULT_MONITORING_CONFIG.pageSize);
  const maxPageSize = numberOr(m.max_page_size, DEFAULT_MONITORING_CONFIG.maxPageSize);

  if (pageSize > maxPageSize) {
    throw new ConfigValidationError(
      `monitoring.page_size (${pageSize}) no puede ser mayor que monitoring.max_page_size (${maxPageSize}).`
    );
  }

  return {
    endpoint: stringOr(m.endpoint, DEFAULT_MONITORING_CONFIG.endpoint),
    enabled: boolOr(m.enabled, DEFAULT_MONITORING_CONFIG.enabled),
    cacheMetrics: boolOr(m.cache_metrics, DEFAULT_MONITORING_CONFIG.cacheMetrics),
    cacheDurationSeconds: numberOr(
      m.cache_duration_seconds,
      DEFAULT_MONITORING_CONFIG.cacheDurationSeconds
    ),
    pageSize,
    maxPageSize,
    autoRefreshInterval: numberOr(
      m.auto_refresh_interval,
      DEFAULT_MONITORING_CONFIG.autoRefreshInterval
    ),
    auth,
  };
}

function buildPerformanceConfig(raw: RawApiScopeConfig) {
  const p = raw.performance ?? {};

  const batchSize = numberOr(p.batch_size, DEFAULT_PERFORMANCE_CONFIG.batchSize);
  const batchIntervalMs = numberOr(
    p.batch_interval_ms,
    DEFAULT_PERFORMANCE_CONFIG.batchIntervalMs
  );
  const maxQueueSize = numberOr(p.max_queue_size, DEFAULT_PERFORMANCE_CONFIG.maxQueueSize);

  if (batchSize <= 0) {
    throw new ConfigValidationError(
      `performance.batch_size debe ser mayor a 0 (recibido: ${batchSize}).`
    );
  }
  if (batchIntervalMs <= 0) {
    throw new ConfigValidationError(
      `performance.batch_interval_ms debe ser mayor a 0 (recibido: ${batchIntervalMs}).`
    );
  }
  if (maxQueueSize <= 0) {
    throw new ConfigValidationError(
      `performance.max_queue_size debe ser mayor a 0 (recibido: ${maxQueueSize}).`
    );
  }
  if (batchSize > maxQueueSize) {
    throw new ConfigValidationError(
      `performance.batch_size (${batchSize}) no puede ser mayor que performance.max_queue_size (${maxQueueSize}).`
    );
  }

  return {
    asyncLogging: boolOr(p.async_logging, DEFAULT_PERFORMANCE_CONFIG.asyncLogging),
    batchSize,
    batchIntervalMs,
    maxQueueSize,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function journalModeOr(
  value: unknown,
  fallback: "DELETE" | "WAL" | "MEMORY"
): "DELETE" | "WAL" | "MEMORY" {
  return value === "DELETE" || value === "WAL" || value === "MEMORY"
    ? value
    : fallback;
}
