/** Timestamp actual en formato ISO 8601, el formato exigido en todo el PRD. */
export function isoNow(): string {
  return new Date().toISOString();
}
