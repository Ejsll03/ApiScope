const ENV_VAR_PATTERN = /^\$\{([A-Z0-9_]+)\}$/;

export class MissingEnvVarError extends Error {
  constructor(varName: string, path: string) {
    super(
      `ApiScope: la variable de entorno "${varName}" referenciada en "${path}" no esta definida. ` +
        `Definela en tu .env o como variable de entorno del sistema.`
    );
    this.name = "MissingEnvVarError";
  }
}

/**
 * Recorre `value` recursivamente y reemplaza cualquier string con forma
 * "${VAR_NAME}" por process.env.VAR_NAME. Si la variable no existe, falla
 * de inmediato (RF-06: debe fallar al arranque, no en runtime).
 *
 * El `<T>` es un generic: la firma dice "recibo un valor de tipo T y
 * devuelvo algo del mismo tipo T", asi que si le pasas un objeto tipado
 * conservas ese tipo en el resultado sin tener que castear en cada uso.
 */
export function resolveEnvVars<T>(value: T, path = "$"): T {
  if (typeof value === "string") {
    const match = ENV_VAR_PATTERN.exec(value);
    if (!match) return value;
    const varName = match[1];
    const resolved = process.env[varName];
    if (resolved === undefined) {
      throw new MissingEnvVarError(varName, path);
    }
    return resolved as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveEnvVars(item, `${path}[${index}]`)
    ) as unknown as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveEnvVars(val, `${path}.${key}`);
    }
    return result as T;
  }

  return value;
}
