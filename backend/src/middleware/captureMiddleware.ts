import type { NextFunction, Request, Response } from "express";
import type { CaptureConfig } from "../config/types";
import type { StorageStrategy } from "../storage/types";
import type { RequestData, RequestLogRecord } from "../types";
import { limitBodySize, tryParseJson } from "../utils/bodySize";
import { generateId } from "../utils/ids";
import { maskBody, maskHeaders } from "../utils/mask";
import { isoNow } from "../utils/timestamp";

function isExcluded(req: Request, config: CaptureConfig): boolean {
  if (config.excludedMethods.includes(req.method)) return true;
  return config.excludedPaths.some((excludedPath) => req.path.startsWith(excludedPath));
}

function buildRequestData(
  req: Request,
  config: CaptureConfig,
  requestId: string
): RequestData {
  const rawHeaders = req.headers as Record<string, string | string[] | undefined>;
  const requestHeaders = config.requestHeaders
    ? config.maskSensitiveData
      ? maskHeaders(rawHeaders, config.sensitiveHeaders)
      : rawHeaders
    : {};

  const requestBody = config.requestBody
    ? limitBodySize(
        config.maskSensitiveData ? maskBody(req.body, config.sensitiveBodyFields) : req.body,
        config.maxBodySizeKb
      )
    : undefined;

  return {
    timestamp: isoNow(),
    method: req.method,
    fullUrl: `${req.protocol}://${req.get("host") ?? ""}${req.originalUrl}`,
    path: req.path,
    requestHeaders,
    queryParams: config.requestQuery ? (req.query as Record<string, unknown>) : {},
    requestBody,
    clientIp: req.ip ?? req.socket.remoteAddress ?? "unknown",
    userAgent: req.get("user-agent") ?? "",
    requestId,
  };
}

/**
 * Middleware de captura automatica para Express (RF-02). Registra cada
 * request/response en la StorageStrategy configurada sin bloquear el
 * flujo normal: el guardado ocurre en el evento "finish", cuando la
 * response ya viajo al cliente.
 */
export function captureMiddleware(storage: StorageStrategy, config: CaptureConfig) {
  return function apiScopeCaptureMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (isExcluded(req, config)) {
      next();
      return;
    }

    const requestId = generateId();
    const startedAt = process.hrtime.bigint();
    const requestData = buildRequestData(req, config, requestId);

    const chunks: Buffer[] = [];
    let responseSizeBytes = 0;

    if (config.responseBody) {
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);

      res.write = ((chunk: unknown, ...args: unknown[]) => {
        if (chunk) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
          chunks.push(buf);
          responseSizeBytes += buf.length;
        }
        return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args);
      }) as typeof res.write;

      res.end = ((chunk?: unknown, ...args: unknown[]) => {
        if (chunk && typeof chunk !== "function") {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
          chunks.push(buf);
          responseSizeBytes += buf.length;
        }
        return (originalEnd as (...a: unknown[]) => Response)(chunk, ...args);
      }) as typeof res.end;
    } else {
      res.on("finish", () => {
        const contentLength = res.getHeader("content-length");
        if (typeof contentLength === "string") {
          responseSizeBytes = Number.parseInt(contentLength, 10) || 0;
        }
      });
    }

    res.on("finish", () => {
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      const rawResponseHeaders = res.getHeaders();
      const responseHeaders = config.responseHeaders
        ? config.maskSensitiveData
          ? maskHeaders(rawResponseHeaders, config.sensitiveHeaders)
          : rawResponseHeaders
        : {};

      let responseBody: unknown;
      if (config.responseBody && chunks.length > 0) {
        const text = Buffer.concat(chunks).toString("utf-8");
        const parsed = tryParseJson(text);
        responseBody = limitBodySize(
          config.maskSensitiveData ? maskBody(parsed, config.sensitiveBodyFields) : parsed,
          config.maxBodySizeKb
        );
      }

      // Si una app monta un error-handling middleware de Express que hace
      // `res.locals.apiScopeError = err` antes de responder, capturamos el
      // mensaje y stack trace reales en vez del texto generico del status.
      const capturedError =
        res.locals.apiScopeError instanceof Error ? res.locals.apiScopeError : undefined;

      const record: RequestLogRecord = {
        ...requestData,
        id: requestId,
        type: "request",
        statusCode: res.statusCode,
        responseHeaders,
        responseBody,
        latencyMs: Math.round(latencyMs * 100) / 100,
        responseSizeBytes,
        errorMessage:
          res.statusCode >= 400
            ? capturedError?.message ?? res.statusMessage ?? undefined
            : undefined,
        stackTrace: capturedError?.stack,
      };

      storage.saveRequestLog(record).catch((err) => {
        // RNF-02: un fallo del paquete nunca debe tumbar la app anfitriona.
        console.error("[ApiScope] no se pudo guardar el log de la request:", err);
      });
    });

    next();
  };
}
