import type { QueryOptions } from "../storage/types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const str = asString(value);
  if (str === undefined) return undefined;
  const num = Number(str);
  return Number.isFinite(num) ? num : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  const str = asString(value);
  if (str === undefined) return undefined;
  const items = str
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

function asNumberList(value: unknown): number[] | undefined {
  const items = asStringList(value);
  if (!items) return undefined;
  const numbers = items.map(Number).filter((num) => Number.isFinite(num));
  return numbers.length > 0 ? numbers : undefined;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const str = asString(value);
  return str && (allowed as readonly string[]).includes(str) ? (str as T) : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  const str = asString(value);
  if (str === "true") return true;
  if (str === "false") return false;
  return undefined;
}

/**
 * El default historico de este endpoint es "solo requests" (asi nacio en
 * la fase 4, y lo sigue cubriendo un test). RF-05 pide ademas que los logs
 * manuales sean "consultables mediante filtros" y paginables "como los
 * logs de requests" -- se agrega `type` como filtro explicito y aditivo:
 * sin el query param, el comportamiento no cambia; `type=manual` trae solo
 * logs manuales; `type=all` mezcla ambos (QueryOptions.type=undefined ya
 * significa "sin filtro de tipo" en filterLogRecords()).
 */
function resolveType(query: Record<string, unknown>): "request" | "manual" | undefined {
  const raw = asEnum(query.type, ["request", "manual", "all"] as const);
  if (raw === undefined) return "request";
  return raw === "all" ? undefined : raw;
}

/**
 * Traduce los query params HTTP de `GET /api/monitoring/requests` (RF-03,
 * seccion "Filtros de Busqueda") a QueryOptions. Valores invalidos o
 * ausentes simplemente se omiten (quedan `undefined`) en vez de fallar --
 * un query param mal formado no debe tumbar el endpoint.
 */
export function parseRequestListQuery(query: Record<string, unknown>): QueryOptions {
  return {
    cursor: asString(query.cursor),
    limit: asNumber(query.limit),
    order: asEnum(query.order, ["asc", "desc"] as const),
    direction: asEnum(query.direction, ["after", "before"] as const),
    type: resolveType(query),
    method: asStringList(query.method)?.map((m) => m.toUpperCase()),
    statusCode: asNumberList(query.status_code),
    pathContains: asString(query.path),
    from: asString(query.from),
    to: asString(query.to),
    latencyMin: asNumber(query.latency_min),
    latencyMax: asNumber(query.latency_max),
    hasError: asBoolean(query.has_error),
  };
}
