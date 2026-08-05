import { Router } from "express";
import type { MonitoringConfig } from "../config/types";
import type { StorageStrategy } from "../storage/types";
import { basicAuthMiddleware } from "./basicAuth";
import { createMetricsCache } from "./metricsCache";
import { parseRequestListQuery } from "./queryFilters";
import { toHttpLogRecord, toHttpMetrics, toHttpPage } from "./serializers";

/**
 * Router de monitoreo (RF-03): GET /metrics, GET /requests, GET
 * /requests/:id. Se monta con `app.use(config.monitoring.endpoint,
 * apiscope.monitoringRouter())` -- el router no conoce su propio mount
 * path, lo decide quien lo monta (mismo patron que `middleware()`).
 */
export function createMonitoringRouter(storage: StorageStrategy, monitoring: MonitoringConfig): Router {
  const router = Router();
  const getMetrics = createMetricsCache(storage, monitoring);

  router.use((_req, res, next) => {
    if (!monitoring.enabled) {
      res.status(404).json({ error: "monitoring disabled" });
      return;
    }
    next();
  });

  router.use(basicAuthMiddleware(monitoring.auth));

  router.get("/metrics", async (_req, res) => {
    const snapshot = await getMetrics();
    res.json(toHttpMetrics(snapshot));
  });

  router.get("/requests", async (req, res) => {
    const options = parseRequestListQuery(req.query as Record<string, unknown>);
    const page = await storage.getRecords(options);
    res.json(toHttpPage(page));
  });

  router.get("/requests/:id", async (req, res) => {
    const record = await storage.getRecordById(req.params.id);
    if (!record || record.type !== "request") {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(toHttpLogRecord(record));
  });

  return router;
}
