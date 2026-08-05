import { describe, expect, it } from "vitest";
import { encodeCursor } from "../../../src/storage/cursor";
import { filterLogRecords, paginate } from "../../../src/storage/pagination";
import type { ManualLogRecord, RequestLogRecord } from "../../../src/types";

interface Item {
  id: string;
  timestamp: string;
}

function item(id: string, timestamp: string): Item {
  return { id, timestamp };
}

describe("paginate", () => {
  const records = [
    item("a", "2026-01-01T00:00:00.000Z"),
    item("b", "2026-01-01T00:00:01.000Z"),
    item("c", "2026-01-01T00:00:02.000Z"),
  ];

  it("ordena desc por default (mas reciente primero)", () => {
    const page = paginate(records);
    expect(page.data.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(page.pagination.totalCount).toBe(3);
  });

  it("ordena asc cuando se pide explicitamente", () => {
    const page = paginate(records, { order: "asc" });
    expect(page.data.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("clampa limit entre 1 y 200", () => {
    expect(paginate(records, { limit: 0 }).data).toHaveLength(1);
    expect(paginate(records, { limit: 500 }).data).toHaveLength(3);
  });

  it("hasMore es true y nextCursor apunta al ultimo item de la pagina", () => {
    const page = paginate(records, { limit: 2 });
    expect(page.data.map((r) => r.id)).toEqual(["c", "b"]);
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.nextCursor).toBe(encodeCursor(page.data[1]));
  });

  it("hasMore es false cuando la pagina cubre todos los registros", () => {
    const page = paginate(records, { limit: 10 });
    expect(page.pagination.hasMore).toBe(false);
    expect(page.pagination.nextCursor).toBeNull();
  });

  it("avanza a partir de un cursor", () => {
    const firstPage = paginate(records, { limit: 1 });
    const cursor = firstPage.pagination.nextCursor!;
    const secondPage = paginate(records, { limit: 1, cursor });
    expect(secondPage.data.map((r) => r.id)).toEqual(["b"]);
  });

  it("un cursor de un id inexistente vuelve a empezar desde el principio", () => {
    const page = paginate(records, { cursor: encodeCursor(item("z", "2099-01-01T00:00:00.000Z")) });
    expect(page.data.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  describe("prevCursor / direction (RF-03: paginacion bidireccional)", () => {
    it("prevCursor es null en la primera pagina (no hay pagina anterior)", () => {
      const page = paginate(records, { limit: 2 });
      expect(page.pagination.prevCursor).toBeNull();
    });

    it("prevCursor apunta al primer item de la pagina cuando si hay una pagina anterior", () => {
      const firstPage = paginate(records, { limit: 2 });
      const secondPage = paginate(records, { limit: 2, cursor: firstPage.pagination.nextCursor! });

      expect(secondPage.data.map((r) => r.id)).toEqual(["a"]);
      expect(secondPage.pagination.prevCursor).toBe(encodeCursor(secondPage.data[0]));
    });

    it("direction=before + prevCursor reproduce exactamente la pagina anterior", () => {
      const firstPage = paginate(records, { limit: 2 });
      const secondPage = paginate(records, { limit: 2, cursor: firstPage.pagination.nextCursor! });

      const backToFirst = paginate(records, {
        limit: 2,
        cursor: secondPage.pagination.prevCursor!,
        direction: "before",
      });

      expect(backToFirst.data.map((r) => r.id)).toEqual(firstPage.data.map((r) => r.id));
      expect(backToFirst.pagination.nextCursor).toBe(firstPage.pagination.nextCursor);
      expect(backToFirst.pagination.prevCursor).toBeNull();
    });
  });
});

const requestFields = {
  fullUrl: "http://localhost/x",
  requestHeaders: {},
  queryParams: {},
  requestBody: undefined,
  clientIp: "127.0.0.1",
  userAgent: "vitest",
  responseHeaders: {},
  responseBody: undefined,
  responseSizeBytes: 0,
  errorMessage: undefined,
  stackTrace: undefined,
};

function requestRecord(overrides: Partial<RequestLogRecord> = {}): RequestLogRecord {
  return {
    id: "req-1",
    type: "request",
    requestId: "req-1",
    timestamp: "2026-01-01T00:00:00.000Z",
    method: "GET",
    path: "/health",
    statusCode: 200,
    latencyMs: 10,
    ...requestFields,
    ...overrides,
  };
}

function manualRecord(overrides: Partial<ManualLogRecord> = {}): ManualLogRecord {
  return {
    id: "manual-1",
    type: "manual",
    timestamp: "2026-01-01T00:00:00.000Z",
    level: "INFO",
    message: "hola",
    ...overrides,
  };
}

describe("filterLogRecords", () => {
  it("sin filtros, devuelve todo sin tocar (compatibilidad con getRecords() existente)", () => {
    const all = [requestRecord(), manualRecord()];
    expect(filterLogRecords(all, {})).toEqual(all);
  });

  it("type: 'request' excluye los ManualLogRecord", () => {
    const all = [requestRecord({ id: "r1" }), manualRecord({ id: "m1" })];
    const filtered = filterLogRecords(all, { type: "request" });
    expect(filtered.map((r) => r.id)).toEqual(["r1"]);
  });

  it("filtros de request (method) excluyen automaticamente los ManualLogRecord", () => {
    const all = [requestRecord({ id: "r1", method: "GET" }), manualRecord({ id: "m1" })];
    const filtered = filterLogRecords(all, { method: ["GET"] });
    expect(filtered.map((r) => r.id)).toEqual(["r1"]);
  });

  it("method: multi-select por lista de metodos HTTP", () => {
    const all = [
      requestRecord({ id: "get", method: "GET" }),
      requestRecord({ id: "post", method: "POST" }),
      requestRecord({ id: "delete", method: "DELETE" }),
    ];
    const filtered = filterLogRecords(all, { method: ["GET", "POST"] });
    expect(filtered.map((r) => r.id).sort()).toEqual(["get", "post"]);
  });

  it("statusCode: multi-select por status codes exactos", () => {
    const all = [
      requestRecord({ id: "ok", statusCode: 200 }),
      requestRecord({ id: "notfound", statusCode: 404 }),
      requestRecord({ id: "error", statusCode: 500 }),
    ];
    const filtered = filterLogRecords(all, { statusCode: [200, 500] });
    expect(filtered.map((r) => r.id).sort()).toEqual(["error", "ok"]);
  });

  it("pathContains: busqueda parcial en el path", () => {
    const all = [
      requestRecord({ id: "users", path: "/api/users" }),
      requestRecord({ id: "orders", path: "/api/orders" }),
    ];
    const filtered = filterLogRecords(all, { pathContains: "user" });
    expect(filtered.map((r) => r.id)).toEqual(["users"]);
  });

  it("from/to: rango de fechas inclusive sobre timestamp", () => {
    const all = [
      requestRecord({ id: "early", timestamp: "2026-01-01T00:00:00.000Z" }),
      requestRecord({ id: "mid", timestamp: "2026-01-02T00:00:00.000Z" }),
      requestRecord({ id: "late", timestamp: "2026-01-03T00:00:00.000Z" }),
    ];
    const filtered = filterLogRecords(all, {
      from: "2026-01-01T12:00:00.000Z",
      to: "2026-01-02T12:00:00.000Z",
    });
    expect(filtered.map((r) => r.id)).toEqual(["mid"]);
  });

  it("latencyMin/latencyMax: rango de latencia inclusive", () => {
    const all = [
      requestRecord({ id: "fast", latencyMs: 5 }),
      requestRecord({ id: "mid", latencyMs: 50 }),
      requestRecord({ id: "slow", latencyMs: 500 }),
    ];
    const filtered = filterLogRecords(all, { latencyMin: 10, latencyMax: 100 });
    expect(filtered.map((r) => r.id)).toEqual(["mid"]);
  });

  it("hasError: true trae solo statusCode >= 400", () => {
    const all = [
      requestRecord({ id: "ok", statusCode: 200 }),
      requestRecord({ id: "clienterr", statusCode: 404 }),
      requestRecord({ id: "servererr", statusCode: 500 }),
    ];
    const filtered = filterLogRecords(all, { hasError: true });
    expect(filtered.map((r) => r.id).sort()).toEqual(["clienterr", "servererr"]);
  });

  it("hasError: false trae solo statusCode < 400", () => {
    const all = [
      requestRecord({ id: "ok", statusCode: 200 }),
      requestRecord({ id: "err", statusCode: 500 }),
    ];
    const filtered = filterLogRecords(all, { hasError: false });
    expect(filtered.map((r) => r.id)).toEqual(["ok"]);
  });

  it("combina varios filtros a la vez (AND)", () => {
    const all = [
      requestRecord({ id: "match", method: "GET", statusCode: 200, path: "/api/users" }),
      requestRecord({ id: "wrong-method", method: "POST", statusCode: 200, path: "/api/users" }),
      requestRecord({ id: "wrong-status", method: "GET", statusCode: 404, path: "/api/users" }),
    ];
    const filtered = filterLogRecords(all, { method: ["GET"], statusCode: [200] });
    expect(filtered.map((r) => r.id)).toEqual(["match"]);
  });
});
