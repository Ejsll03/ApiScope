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

function challenge(res: Response): void {
  res.set("WWW-Authenticate", REALM);
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
      challenge(res);
      return;
    }

    next();
  };
}
