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
 * MemoryStorage y SqliteStorage para no duplicar la logica de orden +
 * cursor + limit (RF-03). `prevCursor` queda deliberadamente `null` --
 * se resuelve en la fase 4 cuando existan los endpoints reales del monitor.
 */
export function paginate<T extends { id: string; timestamp: string }>(
  allRecords: T[],
  options: QueryOptions = {}
): CursorPage<T> {
  const limit = clamp(options.limit ?? 50, 1, 200);
  const order = options.order ?? "desc";
  const sorted = [...allRecords].sort((a, b) => compareRecords(a, b, order));

  let startIndex = 0;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    const cursorIndex = sorted.findIndex((r) => r.id === cursor.id);
    startIndex = cursorIndex === -1 ? 0 : cursorIndex + 1;
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;
  const lastItem = page[page.length - 1];

  return {
    data: page,
    pagination: {
      hasMore,
      nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
      prevCursor: null,
      totalCount: sorted.length,
    },
  };
}
