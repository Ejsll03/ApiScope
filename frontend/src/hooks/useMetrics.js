import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";

/** RF-03: dashboard con auto-refresh configurable (5s-5min), pausable. */
export function useMetrics({ intervalSeconds = 30, paused = false } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const metrics = await api.getMetrics();
      setData(metrics);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message ?? "No se pudieron cargar las metricas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(load, intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [load, intervalSeconds, paused]);

  return { data, error, loading, lastUpdated, reload: load };
}
