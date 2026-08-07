import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";

const PAGE_LIMIT = 50;

/**
 * Paginacion por cursor bidireccional (RF-03): el backend ya devuelve
 * `next_cursor`/`prev_cursor` autocontenidos y simetricos (ver
 * `backend/src/storage/pagination.ts`), asi que el hook no necesita
 * mantener su propia pila de cursores -- solo reenvia el que corresponda
 * con la `direction` adecuada.
 */
export function useRequests(filters) {
  const [state, setState] = useState({ data: [], pagination: null, loading: true, error: null });
  const filtersKey = JSON.stringify(filters);

  const load = useCallback(
    async (cursor, direction) => {
      setState((current) => ({ ...current, loading: true }));
      try {
        const page = await api.getRequests({ ...filters, cursor, direction, limit: PAGE_LIMIT });
        setState({ data: page.data, pagination: page.pagination, loading: false, error: null });
      } catch (err) {
        setState((current) => ({
          ...current,
          loading: false,
          error: err.message ?? "No se pudieron cargar las requests.",
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey]
  );

  useEffect(() => {
    load(undefined, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // La respuesta HTTP viaja en snake_case (ver toHttpPage en el backend):
  // has_more / next_cursor / prev_cursor / total_count.
  const goNext = useCallback(() => {
    if (!state.pagination?.has_more || !state.pagination.next_cursor) return;
    load(state.pagination.next_cursor, "after");
  }, [state.pagination, load]);

  const goPrev = useCallback(() => {
    if (!state.pagination?.prev_cursor) return;
    load(state.pagination.prev_cursor, "before");
  }, [state.pagination, load]);

  return {
    ...state,
    goNext,
    goPrev,
    canNext: Boolean(state.pagination?.has_more),
    canPrev: Boolean(state.pagination?.prev_cursor),
    reload: () => load(undefined, undefined),
  };
}
