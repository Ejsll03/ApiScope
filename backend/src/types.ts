/**
 * Tipos centrales de ApiScope. Todo lo demas en el paquete se construye
 * sobre estas formas de datos.
 */

/** Nivel de severidad de un log manual (RF-05). */
export type LogLevel = "INFO" | "WARNING" | "ERROR" | "DEBUG";

/** Metodos HTTP soportados por el middleware de captura (RF-02). */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

/** Headers HTTP: Node los expone como string, string[] o number segun el caso. */
export type HeaderMap = Record<string, string | number | string[] | undefined>;

/** Datos capturados de la request entrante. */
export interface RequestData {
  timestamp: string;
  method: string;
  fullUrl: string;
  path: string;
  requestHeaders: HeaderMap;
  queryParams: Record<string, unknown>;
  requestBody: unknown;
  clientIp: string;
  userAgent: string;
  requestId: string;
}

/**
 * Datos capturados de la response saliente. Los nombres de campo son
 * distintos a los de RequestData (`responseHeaders`/`responseBody` en vez
 * de `headers`/`body`) a proposito: RequestLogRecord extiende ambas
 * interfaces, y si compartieran nombre el spread `{...requestData,
 * ...responseFields}` pisaria en silencio los headers/body de la request
 * con los de la response (bug real que existio en una version anterior).
 */
export interface ResponseData {
  statusCode: number;
  responseHeaders: HeaderMap;
  responseBody: unknown;
  latencyMs: number;
  responseSizeBytes: number;
  errorMessage?: string;
  stackTrace?: string;
}

/**
 * Registro completo de una request capturada automaticamente por el middleware.
 * El campo `type: "request"` es un "discriminant": permite que TypeScript
 * distinga este tipo de ManualLogRecord dentro de la union LogRecord de abajo.
 */
export interface RequestLogRecord extends RequestData, ResponseData {
  id: string;
  type: "request";
}

/** Registro de un log manual emitido via logInfo/logWarning/logError/logDebug (RF-05). */
export interface ManualLogRecord {
  id: string;
  type: "manual";
  timestamp: string;
  level: LogLevel;
  message: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
  context?: {
    file?: string;
    line?: number;
    function?: string;
  };
}

/**
 * Union discriminada: un LogRecord es o bien un RequestLogRecord o bien un
 * ManualLogRecord. Gracias al campo `type`, si haces:
 *
 *   if (record.type === "request") { ... }
 *
 * TypeScript "estrecha" (narrows) el tipo dentro del bloque y te da
 * autocompletado de los campos propios de RequestLogRecord.
 */
export type LogRecord = RequestLogRecord | ManualLogRecord;
