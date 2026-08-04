import type { LogRecord, ManualLogRecord, RequestLogRecord } from "../types";

export interface QueryOptions {
  cursor?: string;
  /** Registros por pagina. Se clampa entre 1 y 200 (RF-03). */
  limit?: number;
  order?: "asc" | "desc";
}

/**
 * `<T>` aqui significa "una pagina de lo que sea que estemos paginando".
 * Lo usamos como CursorPage<LogRecord> pero queda reutilizable para
 * cualquier otra lista paginada que necesitemos mas adelante.
 */
export interface CursorPage<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
    totalCount: number;
  };
}

/**
 * Contrato comun que deben cumplir todas las estrategias de storage
 * (memoria, SQLite, PostgreSQL). El resto del paquete programa contra
 * esta interface, nunca contra una implementacion concreta -- asi el
 * middleware y el Logger no necesitan saber que backend hay detras.
 */
export interface StorageStrategy {
  init(): Promise<void>;
  saveRequestLog(record: RequestLogRecord): Promise<void>;
  saveManualLog(record: ManualLogRecord): Promise<void>;
  getRecords(options?: QueryOptions): Promise<CursorPage<LogRecord>>;
  getRecordById(id: string): Promise<LogRecord | null>;
  close(): Promise<void>;
}
