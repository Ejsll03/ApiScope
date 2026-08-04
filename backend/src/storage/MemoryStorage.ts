import type { MemoryStorageConfig } from "../config/types";
import type { LogRecord, ManualLogRecord, RequestLogRecord } from "../types";
import { paginate } from "./pagination";
import type { CursorPage, QueryOptions, StorageStrategy } from "./types";

/**
 * Storage volatil en RAM (RF-04.1). Pensado para desarrollo/testing: es
 * el mas rapido porque no hay I/O de disco, pero todo se pierde al
 * reiniciar el proceso.
 */
export class MemoryStorage implements StorageStrategy {
  private records: LogRecord[] = [];
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(private readonly config: MemoryStorageConfig) {}

  async init(): Promise<void> {
    if (this.config.cleanupEnabled) {
      const intervalMs = this.config.cleanupIntervalMinutes * 60 * 1000;
      this.cleanupTimer = setInterval(() => this.runCleanup(), intervalMs);
      this.cleanupTimer.unref();
    }
  }

  async saveRequestLog(record: RequestLogRecord): Promise<void> {
    this.push(record);
  }

  async saveManualLog(record: ManualLogRecord): Promise<void> {
    this.push(record);
  }

  async getRecords(options: QueryOptions = {}): Promise<CursorPage<LogRecord>> {
    return paginate(this.records, options);
  }

  async getRecordById(id: string): Promise<LogRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private push(record: LogRecord): void {
    this.records.push(record);
    if (this.records.length > this.config.maxRecords) {
      this.records.shift();
    }
  }

  private runCleanup(): void {
    const cutoffMs = Date.now() - this.config.cleanupOlderThanHours * 60 * 60 * 1000;
    this.records = this.records.filter(
      (record) => new Date(record.timestamp).getTime() >= cutoffMs
    );
  }
}
