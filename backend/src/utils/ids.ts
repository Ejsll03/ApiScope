import { randomUUID } from "node:crypto";

/** UUID v4 para identificar requests y logs manuales (RF-02, RF-05). */
export function generateId(): string {
  return randomUUID();
}
