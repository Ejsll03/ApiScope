import type { RequestHandler, Router } from "express";
import { loadConfig, type LoadConfigOptions } from "./config/loadConfig";
import type { ApiScopeConfig } from "./config/types";
import { Logger } from "./logging/Logger";
import { captureMiddleware } from "./middleware/captureMiddleware";
import { createMonitoringRouter } from "./monitoring/router";
import { createStorage } from "./storage/StorageFactory";
import type { StorageStrategy } from "./storage/types";

export class ApiScope {
  readonly config: ApiScopeConfig;
  readonly storage: StorageStrategy;
  readonly logger: Logger;

  private ready = false;

  constructor(options: LoadConfigOptions = {}) {
    this.config = loadConfig(options);
    this.storage = createStorage(this.config.storage, this.config.performance);
    this.logger = new Logger(this.storage, {
      maskSensitiveData: this.config.capture.maskSensitiveData,
      sensitiveBodyFields: this.config.capture.sensitiveBodyFields,
    });
  }

  /** Inicializa el storage (crea tablas, arranca timers de limpieza, etc). */
  async init(): Promise<void> {
    if (this.ready) return;
    await this.storage.init();
    this.ready = true;
  }

  /** Middleware de captura automatica de requests/responses (RF-02). Montalo con app.use(). */
  middleware(): RequestHandler {
    return captureMiddleware(this.storage, this.config.capture);
  }

  /**
   * Router de monitoreo (RF-03): GET /metrics, GET /requests, GET
   * /requests/:id. Montalo en `config.monitoring.endpoint`:
   * `app.use(apiscope.config.monitoring.endpoint, apiscope.monitoringRouter())`.
   */
  monitoringRouter(): Router {
    return createMonitoringRouter(this.storage, this.config.monitoring);
  }

  logInfo(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.logger.logInfo(message, metadata);
  }

  logWarning(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.logger.logWarning(message, metadata);
  }

  logError(message: string, error?: Error, metadata?: Record<string, unknown>): Promise<void> {
    return this.logger.logError(message, error, metadata);
  }

  logDebug(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.logger.logDebug(message, metadata);
  }

  async close(): Promise<void> {
    await this.storage.close();
  }
}

export type { ApiScopeConfig } from "./config/types";
export type {
  LogLevel,
  LogRecord,
  ManualLogRecord,
  RequestLogRecord,
} from "./types";
export type { CursorPage, QueryOptions, StorageStrategy } from "./storage/types";
