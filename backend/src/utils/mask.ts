const MASK_VALUE = "***MASKED***";

/**
 * Devuelve una copia de `headers` con los headers listados en
 * `sensitiveHeaderNames` reemplazados por un valor fijo. La comparacion
 * de nombres es case-insensitive porque los headers HTTP lo son.
 */
export function maskHeaders<T extends Record<string, unknown>>(
  headers: T,
  sensitiveHeaderNames: string[]
): T {
  const sensitiveSet = new Set(sensitiveHeaderNames.map((h) => h.toLowerCase()));
  const result = {} as T;

  for (const [key, value] of Object.entries(headers)) {
    (result as Record<string, unknown>)[key] = sensitiveSet.has(key.toLowerCase())
      ? MASK_VALUE
      : value;
  }

  return result;
}

/**
 * Enmascara recursivamente los campos de `body` cuyo nombre aparezca en
 * `sensitiveFieldNames` (case-insensitive). La lista es 100% configurable
 * vía `capture.sensitive_body_fields` en `logger.config.json` -- este
 * util no asume ningun nombre de campo por si mismo (politica de
 * seguridad de CLAUDE.md: los campos a omitir se especifican por config).
 */
export function maskBody(body: unknown, sensitiveFieldNames: string[]): unknown {
  const sensitiveSet = new Set(sensitiveFieldNames.map((f) => f.toLowerCase()));
  return maskBodyValue(body, sensitiveSet);
}

function maskBodyValue(body: unknown, sensitiveSet: Set<string>): unknown {
  if (Array.isArray(body)) {
    return body.map((item) => maskBodyValue(item, sensitiveSet));
  }

  if (body !== null && typeof body === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      result[key] = sensitiveSet.has(key.toLowerCase())
        ? MASK_VALUE
        : maskBodyValue(value, sensitiveSet);
    }
    return result;
  }

  return body;
}
