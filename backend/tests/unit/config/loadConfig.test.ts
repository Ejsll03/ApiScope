import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigValidationError, loadConfig } from "../../../src/config/loadConfig";
import type { RawApiScopeConfig } from "../../../src/config/types";

const NON_EXISTENT_ENV_PATH = path.join(os.tmpdir(), "apiscope-test-env-does-not-exist");

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function writeConfig(config: RawApiScopeConfig): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apiscope-test-"));
  const configPath = path.join(tmpDir, "logger.config.json");
  fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");
  return configPath;
}

describe("loadConfig - defaults (sin logger.config.json)", () => {
  it("aplica todos los defaults cuando no existe el archivo de config", () => {
    const config = loadConfig({
      configPath: path.join(os.tmpdir(), "apiscope-test-no-such-file.json"),
      envPath: NON_EXISTENT_ENV_PATH,
    });

    expect(config.storage).toEqual({
      strategy: "memory",
      maxRecords: 5000,
      cleanupEnabled: true,
      cleanupIntervalMinutes: 10,
      cleanupOlderThanHours: 24,
    });
    expect(config.capture.sensitiveBodyFields).toEqual([
      "password",
      "passwd",
      "secret",
      "token",
    ]);
  });
});

describe("loadConfig - fail-fast: postgresql sin credenciales", () => {
  it("lanza ConfigValidationError si falta connection_string y tambien database/user", () => {
    const configPath = writeConfig({
      storage: { strategy: "postgresql", config: { host: "db.internal" } },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("no lanza si hay connection_string", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "postgresql",
        config: { connection_string: "postgresql://user:pass@host:5432/db" },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).not.toThrow();
  });

  it("no lanza si hay database y user (sin connection_string)", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "postgresql",
        config: { database: "apiscope", user: "apiscope" },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).not.toThrow();
  });
});

describe("loadConfig - fail-fast: sqlite con database_path vacio", () => {
  it("lanza ConfigValidationError si database_path es string vacio", () => {
    const configPath = writeConfig({
      storage: { strategy: "sqlite", config: { database_path: "" } },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - fail-fast: monitoring.page_size > max_page_size", () => {
  it("lanza ConfigValidationError si page_size supera a max_page_size", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      monitoring: { page_size: 300, max_page_size: 200 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - fail-fast: capture.max_body_size_kb invalido", () => {
  it("lanza ConfigValidationError si max_body_size_kb es 0 o negativo", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      capture: { max_body_size_kb: 0 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - capture.sensitive_body_fields configurable", () => {
  it("reemplaza la lista default cuando el usuario la especifica", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      capture: { sensitive_body_fields: ["pin"] },
    });

    const config = loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH });
    expect(config.capture.sensitiveBodyFields).toEqual(["pin"]);
  });
});

describe("loadConfig - fail-fast: performance", () => {
  it("lanza ConfigValidationError si batch_size es 0 o negativo", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      performance: { batch_size: 0 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si batch_interval_ms es 0 o negativo", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      performance: { batch_interval_ms: -1 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si max_queue_size es 0 o negativo", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      performance: { max_queue_size: 0 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si batch_size supera a max_queue_size", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      performance: { batch_size: 500, max_queue_size: 100 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("aplica los defaults de performance cuando la seccion no esta presente", () => {
    const configPath = writeConfig({ storage: { strategy: "memory" } });
    const config = loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH });

    expect(config.performance).toEqual({
      asyncLogging: true,
      batchSize: 50,
      batchIntervalMs: 1000,
      maxQueueSize: 1000,
    });
  });

  it("respeta async_logging: false", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      performance: { async_logging: false },
    });

    const config = loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH });
    expect(config.performance.asyncLogging).toBe(false);
  });
});

describe("loadConfig - fail-fast: tipos de datos incorrectos", () => {
  it("lanza ConfigValidationError si storage.config.max_records no es number", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory", config: { max_records: "5000" as unknown as number } },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si storage.config.cleanup_enabled no es boolean", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "memory",
        config: { cleanup_enabled: "true" as unknown as boolean },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si storage.config.database_path no es string", () => {
    const configPath = writeConfig({
      storage: { strategy: "sqlite", config: { database_path: 123 as unknown as string } },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si capture.sensitive_headers no es array de strings", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      capture: { sensitive_headers: "authorization" as unknown as string[] },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si capture.excluded_paths trae un elemento no-string", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      capture: { excluded_paths: ["/health", 42] as unknown as string[] },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - fail-fast: rangos faltantes", () => {
  it("lanza ConfigValidationError si storage.config.port esta fuera de 1-65535", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "postgresql",
        config: { database: "db", user: "u", port: 70000 },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si storage.config.pool_size es 0", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "postgresql",
        config: { database: "db", user: "u", pool_size: 0 },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si storage.config.timeout_ms es negativo", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "postgresql",
        config: { database: "db", user: "u", timeout_ms: -1 },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si storage.config.max_records (memory) es 0", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory", config: { max_records: 0 } },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si monitoring.auto_refresh_interval es menor a 5", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      monitoring: { auto_refresh_interval: 1 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si monitoring.auto_refresh_interval es mayor a 300", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      monitoring: { auto_refresh_interval: 400 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si monitoring.auth.session_timeout_hours es 0", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      monitoring: { auth: { session_timeout_hours: 0 } },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - fail-fast: enums invalidos", () => {
  it("lanza ConfigValidationError si storage.config.journal_mode no es DELETE/WAL/MEMORY", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "sqlite",
        config: { journal_mode: "FOO" as unknown as "WAL" },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si monitoring.auth.type no es 'basic'", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      monitoring: { auth: { type: "jwt" as unknown as "basic" } },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - fail-fast: formatos invalidos", () => {
  it("lanza ConfigValidationError si connection_string no parece una URI de Postgres", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "postgresql",
        config: { connection_string: "mysql://user:pass@host:3306/db" },
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("lanza ConfigValidationError si monitoring.endpoint no empieza con '/'", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      monitoring: { endpoint: "api/monitoring" },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - retention", () => {
  it("aplica los defaults de retention cuando la seccion no esta presente", () => {
    const configPath = writeConfig({ storage: { strategy: "memory" } });
    const config = loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH });

    expect(config.retention).toEqual({
      enabled: false,
      maxRecords: 10000,
      cleanupIntervalMinutes: 30,
      cleanupOlderThanDays: 7,
      archiveBeforeDelete: false,
      archivePath: null,
    });
  });

  it("aplica los defaults de retention cuando no existe logger.config.json", () => {
    const config = loadConfig({
      configPath: path.join(os.tmpdir(), "apiscope-test-no-such-file.json"),
      envPath: NON_EXISTENT_ENV_PATH,
    });

    expect(config.retention.enabled).toBe(false);
    expect(config.retention.maxRecords).toBe(10000);
  });

  it("respeta valores custom de retention", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      retention: {
        enabled: true,
        max_records: 20000,
        cleanup_interval_minutes: 15,
        cleanup_older_than_days: 3,
      },
    });

    const config = loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH });
    expect(config.retention).toEqual({
      enabled: true,
      maxRecords: 20000,
      cleanupIntervalMinutes: 15,
      cleanupOlderThanDays: 3,
      archiveBeforeDelete: false,
      archivePath: null,
    });
  });

  it("lanza ConfigValidationError si archive_before_delete es true sin archive_path", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      retention: { archive_before_delete: true },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });

  it("no lanza si archive_before_delete es true y archive_path esta presente", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      retention: { archive_before_delete: true, archive_path: "./archive" },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).not.toThrow();
  });

  it("lanza ConfigValidationError si retention.max_records es 0", () => {
    const configPath = writeConfig({
      storage: { strategy: "memory" },
      retention: { max_records: 0 },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).toThrow(ConfigValidationError);
  });
});

describe("loadConfig - camino feliz con todos los campos nuevos", () => {
  it("no lanza con una config completa y valida", () => {
    const configPath = writeConfig({
      storage: {
        strategy: "postgresql",
        config: {
          connection_string: "postgresql://user:pass@host:5432/db",
          pool_size: 5,
          timeout_ms: 3000,
          port: 5432,
        },
      },
      capture: {
        excluded_paths: ["/health"],
        excluded_methods: ["OPTIONS"],
        sensitive_headers: ["authorization", "x-api-key"],
        sensitive_body_fields: ["password"],
      },
      monitoring: {
        endpoint: "/api/monitoring",
        auto_refresh_interval: 60,
        auth: { type: "basic", session_timeout_hours: 2 },
      },
      retention: {
        enabled: true,
        max_records: 5000,
        archive_before_delete: true,
        archive_path: "./archive",
      },
    });

    expect(() =>
      loadConfig({ configPath, envPath: NON_EXISTENT_ENV_PATH })
    ).not.toThrow();
  });
});
