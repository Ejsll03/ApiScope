import { describe, expect, it } from "vitest";
import { encodeCursor } from "../../../src/storage/cursor";
import { paginate } from "../../../src/storage/pagination";

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

  it("prevCursor siempre es null (pendiente hasta fase 4)", () => {
    expect(paginate(records).pagination.prevCursor).toBeNull();
  });

  it("un cursor de un id inexistente vuelve a empezar desde el principio", () => {
    const page = paginate(records, { cursor: encodeCursor(item("z", "2099-01-01T00:00:00.000Z")) });
    expect(page.data.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
