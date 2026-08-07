import { useEffect, useState } from "react";
import { api } from "../api/client.js";

export function useRequestDetail(id) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    api
      .getRequestById(id)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err.message ?? "No se encontro el registro." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
