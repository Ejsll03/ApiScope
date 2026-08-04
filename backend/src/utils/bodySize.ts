/**
 * Si `value` serializado pesa mas que `maxKb`, lo reemplaza por un texto
 * de aviso en vez de guardarlo entero (RF-02: max_body_size_kb).
 */
export function limitBodySize(value: unknown, maxKb: number): unknown {
  if (value === undefined || value === null) return value;

  let serialized: string;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "[BODY NO SERIALIZABLE]";
  }

  const sizeBytes = Buffer.byteLength(serialized, "utf-8");
  if (sizeBytes <= maxKb * 1024) {
    return value;
  }

  return `[BODY TOO LARGE: ${(sizeBytes / 1024).toFixed(1)}KB, limite ${maxKb}KB]`;
}

/** Intenta parsear texto como JSON; si falla, devuelve el texto tal cual. */
export function tryParseJson(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
