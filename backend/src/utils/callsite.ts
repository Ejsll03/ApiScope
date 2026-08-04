import path from "node:path";

export interface CallSite {
  file?: string;
  line?: number;
  function?: string;
}

// __dirname aqui es ".../src/utils" (o ".../dist/utils" ya compilado), asi
// que subir un nivel nos da la raiz del propio paquete: cualquier frame de
// stack que empiece con esta ruta es codigo interno de ApiScope, no del
// usuario.
const PACKAGE_ROOT = path.resolve(__dirname, "..");

function parseFrame(frame: string): CallSite {
  const withFunctionName = /at\s+(.*)\s+\((.*):(\d+):(\d+)\)/.exec(frame);
  if (withFunctionName) {
    return {
      function: withFunctionName[1],
      file: withFunctionName[2],
      line: Number(withFunctionName[3]),
    };
  }

  const withoutFunctionName = /at\s+(.*):(\d+):(\d+)/.exec(frame);
  if (withoutFunctionName) {
    return { file: withoutFunctionName[1], line: Number(withoutFunctionName[2]) };
  }

  return {};
}

/**
 * Devuelve el primer frame del stack que no pertenece al propio paquete
 * ApiScope: el punto real del codigo del usuario que disparo el log, sin
 * importar cuantas capas internas (Logger, ApiScope, etc.) haya en el
 * medio. Es mas robusto que contar frames a mano, que se rompe apenas se
 * agrega un wrapper nuevo.
 */
export function getCallerCallSite(): CallSite {
  const stackLines = (new Error().stack ?? "").split("\n").slice(1);

  for (const line of stackLines) {
    const site = parseFrame(line);
    if (site.file && !site.file.startsWith(PACKAGE_ROOT)) {
      return site;
    }
  }

  return {};
}
