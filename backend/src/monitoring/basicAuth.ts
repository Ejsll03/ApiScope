import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { MonitoringAuthConfig } from "../config/types";

const REALM = 'Basic realm="ApiScope Monitoring"';

function parseBasicAuthHeader(header: string): { user: string; pass: string } | null {
  if (!header.startsWith("Basic ")) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
  } catch {
    return null;
  }

  const sepIndex = decoded.indexOf(":");
  if (sepIndex === -1) return null;

  return { user: decoded.slice(0, sepIndex), pass: decoded.slice(sepIndex + 1) };
}

/**
 * Compara strings sin filtrar su longitud/contenido por timing (RNF-05).
 * crypto.timingSafeEqual exige buffers de igual longitud, asi que se
 * comparan los hashes (largo fijo) en vez de los valores crudos.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = crypto.createHash("sha256").update(a).digest();
  const bufB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Chrome (y otros navegadores) interceptan cualquier 401 con
 * `WWW-Authenticate: Basic` a nivel de red -- incluso en `fetch()`/XHR, no
 * solo en navegacion -- e intentan mostrar su propio dialogo nativo de
 * credenciales. La SPA de ApiScope (`frontend/src/auth`) implementa su
 * propio `LoginForm` y nunca depende de ese dialogo nativo: si el header
 * viaja igual, el `fetch()` de `useAuth.js` queda colgado esperando un
 * dialogo que en headless nunca aparece y en un navegador real tapa el
 * LoginForm de la app. Los navegadores mandan `Sec-Fetch-Mode` en todo
 * fetch/XHR (Fetch Metadata Request Headers); curl/Postman/clientes API no
 * lo mandan, asi que sirve para mandar el desafio RFC 7235 completo solo a
 * quien realmente lo necesita.
 */
function challenge(req: Request, res: Response): void {
  if (!req.get("sec-fetch-mode")) {
    res.set("WWW-Authenticate", REALM);
  }
  res.status(401).json({ error: "unauthorized" });
}

/**
 * Autenticacion HTTP Basic para el monitor (RF-03: "Tipo: Autenticación
 * HTTP Basic... sin JWT, tokens complejos ni OAuth - solo validación de
 * credenciales"). Si `auth.enabled` es false, no pide nada -- el monitor
 * queda de acceso publico, tal como especifica RF-03.
 */
export function basicAuthMiddleware(auth: MonitoringAuthConfig): RequestHandler {
  return function apiScopeBasicAuth(req: Request, res: Response, next: NextFunction): void {
    if (!auth.enabled) {
      next();
      return;
    }

    const header = req.headers.authorization;
    const credentials = header ? parseBasicAuthHeader(header) : null;

    if (
      !credentials ||
      !timingSafeEqualStr(credentials.user, auth.username ?? "") ||
      !timingSafeEqualStr(credentials.pass, auth.password ?? "")
    ) {
      challenge(req, res);
      return;
    }

    next();
  };
}
