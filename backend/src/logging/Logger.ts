import type { StorageStrategy } from "../storage/types";
import type { LogLevel, ManualLogRecord } from "../types";
import { getCallerCallSite } from "../utils/callsite";
import { generateId } from "../utils/ids";
import { maskBody } from "../utils/mask";
import { isoNow } from "../utils/timestamp";

export interface LoggerMaskConfig {
  maskSensitiveData: boolean;
  sensitiveBodyFields: string[];
}

/**
 * API de logging manual (RF-05). Se le pasa la misma StorageStrategy que
 * usa el middleware, asi los logs manuales y automaticos quedan en el
 * mismo lugar y son consultables juntos desde el dashboard.
 *
 * `metadata` es un objeto libre que arma quien llama (ver
 * examples/express-basic/createApp.ts: `logInfo("...", { body: req.body })`),
 * asi que puede traer los mismos campos sensibles que un body de request
 * (RNF-05: "No almacenar passwords en request bodies"). Se enmascara con
 * la misma lista `capture.sensitive_body_fields` que ya usa el middleware
 * de captura, para que un password no quede en texto plano solo por haber
 * pasado por logInfo en lugar del capture automatico.
 */
export class Logger {
  constructor(
    private readonly storage: StorageStrategy,
    private readonly maskConfig: LoggerMaskConfig
  ) {}

  async logInfo(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.write("INFO", message, undefined, metadata);
  }

  async logWarning(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.write("WARNING", message, undefined, metadata);
  }

  async logError(
    message: string,
    error?: Error,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.write("ERROR", message, error, metadata);
  }

  async logDebug(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.write("DEBUG", message, undefined, metadata);
  }

  private async write(
    level: LogLevel,
    message: string,
    error: Error | undefined,
    metadata: Record<string, unknown> | undefined
  ): Promise<void> {
    const maskedMetadata =
      metadata && this.maskConfig.maskSensitiveData
        ? (maskBody(metadata, this.maskConfig.sensitiveBodyFields) as Record<string, unknown>)
        : metadata;

    const record: ManualLogRecord = {
      id: generateId(),
      type: "manual",
      timestamp: isoNow(),
      level,
      message,
      stackTrace: error?.stack,
      metadata: maskedMetadata,
      context: getCallerCallSite(),
    };

    try {
      await this.storage.saveManualLog(record);
    } catch (storageError) {
      // RNF-02: un fallo interno del paquete nunca debe tumbar la app anfitriona.
      console.error("[ApiScope] no se pudo guardar el log manual:", storageError);
    }
  }
}
