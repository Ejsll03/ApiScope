import type { LogRecord, RequestLogRecord } from "../types";
import { decodeCursor, encodeCursor } from "./cursor";
import type { CursorPage, QueryOptions } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function compareRecords<T extends { id: string; timestamp: string }>(
  a: T,
  b: T,
  order: "asc" | "desc"
): number {
  const diff = a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id);
  return order === "asc" ? diff : -diff;
}

/**
 * Pagina por cursor un array ya cargado en memoria. Compartido entre
 * MemoryStorage, SqliteStorage y PostgresStorage para no duplicar la
 * logica de orden + cursor + limit + direction (RF-03).
 *
 * `direction` decide como se interpreta `cursor` (anchor): "after"
 * (default) trae los `limit` registros siguientes al anchor -- es lo que
 * genera `nextCursor` (anchor = ultimo item de la pagina). "before" trae
 * los `limit` registros anteriores al anchor -- es lo que genera
 * `prevCursor` (anchor = primer item de la pagina). Ambos cursores son
 * simetricos: pedir `cursor: prevCursor, direction: "before"` reproduce
 * exactamente la pagina anterior, con su propio nextCursor/prevCursor
 * identicos a como se vieron la primera vez.
 */
export function paginate<T extends { id: string; timestamp: string }>(
  allRecords: T[],
  options: QueryOptions = {}
): CursorPage<T> {
  const limit = clamp(options.limit ?? 50, 1, 200);
  const order = options.order ?? "desc";
  const direction = options.direction ?? "after";
  const sorted = [...allRecords].sort((a, b) => compareRecords(a, b, order));

  let anchorIndex = -1;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    anchorIndex = sorted.findIndex((r) => r.id === cursor.id);
  }

  let startIndex: number;
  let endIndex: number;
  if (direction === "before" && anchorIndex !== -1) {
    endIndex = anchorIndex;
    startIndex = Math.max(0, endIndex - limit);
  } else {
    startIndex = anchorIndex === -1 ? 0 : anchorIndex + 1;
    endIndex = Math.min(sorted.length, startIndex + limit);
  }

  const page = sorted.slice(startIndex, endIndex);
  const hasMore = endIndex < sorted.length;
  const hasPrevious = startIndex > 0;
  const firstItem = page[0];
  const lastItem = page[page.length - 1];

  return {
    data: page,
    pagination: {
      hasMore,
      nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
      prevCursor: hasPrevious && firstItem ? encodeCursor(firstItem) : null,
      totalCount: sorted.length,
    },
  };
}

/**
 * Aplica los filtros de la seccion "Filtros de Busqueda" de RF-03 sobre un
 * array de LogRecord, antes de paginar. Se llama siempre antes de
 * paginate() para que `totalCount`/`hasMore` reflejen el conjunto ya
 * filtrado, no la tabla completa.
 *
 * Los filtros especificos de request (method/statusCode/pathContains/
 * latencyMin/latencyMax/hasError) solo tienen sentido sobre
 * RequestLogRecord -- si alguno esta presente, los ManualLogRecord quedan
 * afuera automaticamente (no tienen esos campos).
 */
export function filterLogRecords(records: LogRecord[], options: QueryOptions): LogRecord[] {
  const needsRequestFields =
    options.method !== undefined ||
    options.statusCode !== undefined ||
    options.pathContains !== undefined ||
    options.latencyMin !== undefined ||
    options.latencyMax !== undefined ||
    options.hasError !== undefined;

  return records.filter((record) => {
    if (options.type && record.type !== options.type) return false;
    if (options.from && record.timestamp < options.from) return false;
    if (options.to && record.timestamp > options.to) return false;

    if (needsRequestFields) {
      if (record.type !== "request") return false;
      if (!matchesRequestFilters(record, options)) return false;
    }

    return true;
  });
}

function matchesRequestFilters(record: RequestLogRecord, options: QueryOptions): boolean {
  if (options.method && !options.method.includes(record.method)) return false;
  if (options.statusCode && !options.statusCode.includes(record.statusCode)) return false;
  if (options.pathContains && !record.path.includes(options.pathContains)) return false;
  if (options.latencyMin !== undefined && record.latencyMs < options.latencyMin) return false;
  if (options.latencyMax !== undefined && record.latencyMs > options.latencyMax) return false;
  if (options.hasError !== undefined && record.statusCode >= 400 !== options.hasError) return false;
  return true;
}
