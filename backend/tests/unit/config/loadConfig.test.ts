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
