import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";

/** RF-03 "Errores Recientes": ultimos errores, reutilizando /requests?has_error=true. */
export function useRecentErrors({ intervalSeconds = 30, paused = false, limit = 8 } = {}) {
  const [state, setState] = useState({ data: [], loading: true, error: null });

  const load = useCallback(async () => {
    try {
      const page = await api.getRequests({ has_error: true, order: "desc", limit });
      setState({ data: page.data, loading: false, error: null });
    } catch (err) {
      setState({ data: [], loading: false, error: err.message ?? "No se pudieron cargar los errores." });
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(load, intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [load, intervalSeconds, paused]);

  return state;
}
