import type { MonitoringConfig } from "../config/types";
import type { StorageStrategy } from "../storage/types";
import { calculateMetrics, type MetricsSnapshot } from "./metrics";

/**
 * Envuelve calculateMetrics() con un cache TTL simple (RF-03/RNF-01:
 * "Cache de métricas: Reducir tiempo de response del endpoint de
 * monitoreo"). Sin esto, cada request a /metrics recorreria TODOS los
 * RequestLogRecord de nuevo. Se crea una sola vez por router -- el estado
 * del cache vive en el closure, no es compartido entre instancias.
 */
export function createMetricsCache(
  storage: StorageStrategy,
  config: MonitoringConfig
): () => Promise<MetricsSnapshot> {
  let cached: { snapshot: MetricsSnapshot; expiresAt: number } | undefined;

  return async function getMetrics(): Promise<MetricsSnapshot> {
    if (config.cacheMetrics && cached && Date.now() < cached.expiresAt) {
      return cached.snapshot;
    }

    const records = await storage.getAllRequestLogs();
    const snapshot = calculateMetrics(records);

    if (config.cacheMetrics) {
      cached = { snapshot, expiresAt: Date.now() + config.cacheDurationSeconds * 1000 };
    }

    return snapshot;
  };
}
