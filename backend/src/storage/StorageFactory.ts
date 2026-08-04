import type { PerformanceConfig, StorageConfig } from "../config/types";
import { MemoryStorage } from "./MemoryStorage";
import { PostgresStorage } from "./PostgresStorage";
import { SqliteStorage } from "./SqliteStorage";
import type { StorageStrategy } from "./types";

/**
 * Decide que clase de storage instanciar segun `storage.strategy` en la
 * config. Los consumidores del paquete (middleware, Logger, index.ts)
 * nunca importan MemoryStorage/SqliteStorage/PostgresStorage directamente,
 * siempre pasan por aqui -- asi agregar una estrategia nueva no obliga a
 * tocar el resto del codigo.
 */
export function createStorage(
  config: StorageConfig,
  performanceConfig: PerformanceConfig
): StorageStrategy {
  switch (config.strategy) {
    case "memory":
      return new MemoryStorage(config);

    case "sqlite":
      return new SqliteStorage(config, performanceConfig);

    case "postgresql":
      return new PostgresStorage(config, performanceConfig);

    default: {
      // Truco de TypeScript: si algun dia agregamos una estrategia nueva al
      // union type StorageConfig y olvidamos manejarla aqui, esta linea
      // deja de compilar porque `config` ya no seria de tipo `never`.
      const exhaustiveCheck: never = config;
      throw new Error(`ApiScope: storage.strategy desconocida: ${exhaustiveCheck}`);
    }
  }
}
