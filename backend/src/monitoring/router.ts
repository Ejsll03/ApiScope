import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { MonitoringConfig } from "../config/types";
import type { StorageStrategy } from "../storage/types";
import { basicAuthMiddleware } from "./basicAuth";
import { createMetricsCache } from "./metricsCache";
import { parseRequestListQuery } from "./queryFilters";
import { toHttpLogRecord, toHttpMetrics, toHttpPage } from "./serializers";

/**
 * Ubicacion del bundle de la SPA (fase 5): `frontend/` se compila con Vite
 * (vite-plugin-singlefile) directo a `backend/dashboard/index.html` -- un
 * unico HTML con CSS/JS inline, fuera de `src/` y de `dist/` a proposito,
 * para que la misma ruta relativa sirva tanto en dev (tsx, `__dirname` =
 * `src/monitoring`) como en produccion (`dist/monitoring`): dos niveles
 * arriba llegan al root del paquete en ambos casos.
 */
const DASHBOARD_HTML_PATH = path.join(__dirname, "../../dashboard/index.html");

function readDashboardHtml(): string | null {
  try {
    return fs.readFileSync(DASHBOARD_HTML_PATH, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Router de monitoreo (RF-03): GET / (SPA), GET /metrics, GET /requests,
 * GET /requests/:id. Se monta con `app.use(config.monitoring.endpoint,
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

  // GET / (la SPA) queda fuera del gate de Basic Auth a proposito: el
  // login custom de la app (frontend/src/auth) necesita que el HTML cargue
  // siempre para poder detectar un 401 de /metrics via JS y mostrar su
  // propio LoginForm. Si "/" tambien exigiera credenciales, el navegador
  // dispararia su dialogo nativo de Basic Auth antes de que React llegue a
  // montar, y el LoginForm de la app nunca se veria.
  router.get("/", (_req, res) => {
    const html = readDashboardHtml();
    if (html === null) {
      res
        .status(503)
        .send(
          "ApiScope dashboard no esta compilado todavia. Corre `npm run build` " +
            "dentro de frontend/ (ver frontend/README.md) y volve a intentar."
        );
      return;
    }
    res.type("html").send(html);
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
    // Trae tanto RequestLogRecord como ManualLogRecord: RF-05 pide que los
    // logs manuales sean "consultables... como los logs de requests", asi
    // que su detalle vive en el mismo endpoint (toHttpLogRecord ya
    // discrimina la forma segun `type`).
    const record = await storage.getRecordById(req.params.id);
    if (!record) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(toHttpLogRecord(record));
  });

  return router;
}
