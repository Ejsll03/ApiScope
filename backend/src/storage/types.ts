import type { LogRecord, ManualLogRecord, RequestLogRecord } from "../types";

export interface QueryOptions {
  cursor?: string;
  /** Registros por pagina. Se clampa entre 1 y 200 (RF-03). */
  limit?: number;
  order?: "asc" | "desc";
  /**
   * Sentido en el que se interpreta `cursor` (RF-03, paginacion por
   * cursor). "after" (default) continua desde la ultima posicion vista --
   * es lo que produce `nextCursor`. "before" trae la pagina anterior a un
   * anchor -- es lo que produce `prevCursor`. Sin esto, `prevCursor` no
   * podria ser un cursor real y utilizable, solo un `null` permanente.
   */
  direction?: "after" | "before";

  // --- Filtros de la seccion "Filtros de Busqueda" de RF-03. Solo aplican
  // a RequestLogRecord -- si alguno de estos esta presente, los
  // ManualLogRecord quedan afuera del resultado (ver filterLogRecords en
  // pagination.ts). ---
  /** Si se especifica, solo trae registros de ese tipo. */
  type?: "request" | "manual";
  /** Multi-select de metodos HTTP (ej. ["GET", "POST"]). */
  method?: string[];
  /** Multi-select de status codes exactos (ej. [200, 404]). */
  statusCode?: number[];
  /** Busqueda parcial (substring) sobre el path. */
  pathContains?: string;
  /** Rango de fechas (ISO 8601, inclusive) sobre `timestamp`. */
  from?: string;
  to?: string;
  /** Rango de latencia en ms (inclusive). */
  latencyMin?: number;
  latencyMax?: number;
  /** true = solo requests con error (statusCode >= 400), false = solo exitosas. */
  hasError?: boolean;
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
  /**
   * Todos los RequestLogRecord sin paginar (RF-03: el calculo de metricas
   * agregadas -- promedios, percentiles, top endpoints -- necesita el
   * conjunto completo, no una pagina). Separado de getRecords() a
   * proposito: mezclar "trae todo" con la paginacion normal invitaria a
   * bugs de quien olvide pasar un limit.
   */
  getAllRequestLogs(): Promise<RequestLogRecord[]>;
  close(): Promise<void>;
}
