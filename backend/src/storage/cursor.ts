export interface Cursor {
  timestamp: string;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor(cursor: string) {
    super(`Cursor de paginacion invalido: "${cursor}"`);
    this.name = "InvalidCursorError";
  }
}

export function encodeCursor(record: Cursor): string {
  return Buffer.from(JSON.stringify(record)).toString("base64url");
}

export function decodeCursor(cursor: string): Cursor {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Partial<Cursor>;
    if (typeof parsed.timestamp !== "string" || typeof parsed.id !== "string") {
      throw new Error("shape invalida");
    }
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    throw new InvalidCursorError(cursor);
  }
}
