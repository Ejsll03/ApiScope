import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTURE_CONFIG } from "../../../src/config/defaults";
import { Logger } from "../../../src/logging/Logger";
import type { CursorPage, QueryOptions, StorageStrategy } from "../../../src/storage/types";
import type { LogRecord, ManualLogRecord, RequestLogRecord } from "../../../src/types";

function createRecordingStorage(): StorageStrategy & { records: ManualLogRecord[] } {
  const records: ManualLogRecord[] = [];
  return {
    records,
    async init() {},
    async saveRequestLog(_record: RequestLogRecord) {},
    async saveManualLog(record: ManualLogRecord) {
      records.push(record);
    },
    async getRecords(_options?: QueryOptions): Promise<CursorPage<LogRecord>> {
      return { data: [], pagination: { hasMore: false, nextCursor: null, prevCursor: null, totalCount: 0 } };
    },
    async getRecordById() {
      return null;
    },
    async getAllRequestLogs() {
      return [];
    },
    async close() {},
  };
}

describe("Logger", () => {
  it("enmascara los campos sensibles de metadata cuando maskSensitiveData es true", async () => {
    const storage = createRecordingStorage();
    const logger = new Logger(storage, {
      maskSensitiveData: true,
      sensitiveBodyFields: DEFAULT_CAPTURE_CONFIG.sensitiveBodyFields,
    });

    await logger.logInfo("Creando usuario", { body: { username: "erick", password: "hunter2" } });

    const metadata = storage.records[0].metadata as { body: { username: string; password: string } };
    expect(metadata.body.username).toBe("erick");
    expect(metadata.body.password).toBe("***MASKED***");
  });

  it("no enmascara metadata cuando maskSensitiveData es false", async () => {
    const storage = createRecordingStorage();
    const logger = new Logger(storage, {
      maskSensitiveData: false,
      sensitiveBodyFields: DEFAULT_CAPTURE_CONFIG.sensitiveBodyFields,
    });

    await logger.logInfo("Creando usuario", { body: { password: "hunter2" } });

    const metadata = storage.records[0].metadata as { body: { password: string } };
    expect(metadata.body.password).toBe("hunter2");
  });

  it("funciona sin metadata", async () => {
    const storage = createRecordingStorage();
    const logger = new Logger(storage, {
      maskSensitiveData: true,
      sensitiveBodyFields: DEFAULT_CAPTURE_CONFIG.sensitiveBodyFields,
    });

    await logger.logWarning("Sin metadata");

    expect(storage.records[0].metadata).toBeUndefined();
  });

  it("logError enmascara metadata y conserva el stack trace del error", async () => {
    const storage = createRecordingStorage();
    const logger = new Logger(storage, {
      maskSensitiveData: true,
      sensitiveBodyFields: DEFAULT_CAPTURE_CONFIG.sensitiveBodyFields,
    });

    await logger.logError("Fallo al crear usuario", new Error("boom"), { token: "abc123" });

    const record = storage.records[0];
    expect(record.stackTrace).toContain("boom");
    expect((record.metadata as { token: string }).token).toBe("***MASKED***");
  });
});
