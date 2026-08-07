import { useEffect, useState } from "react";
import "./FiltersBar.css";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
const TYPE_TABS = [
  { value: "request", label: "Requests" },
  { value: "manual", label: "Logs manuales" },
  { value: "all", label: "Todos" },
];

/**
 * RF-03 "Filtros de Busqueda". Debounce de 400ms sobre el conjunto
 * completo de filtros para no disparar un fetch por cada tecla. Los
 * filtros propios de requests (method/status/latencia/has_error) se
 * ocultan en la pestaña "Logs manuales": combinarlos con type=manual
 * siempre da 0 resultados (esos campos no existen en un log manual).
 */
export function FiltersBar({ onChange }) {
  const [draft, setDraft] = useState({
    type: "request",
    method: [],
    status_code: "",
    path: "",
    from: "",
    to: "",
    latency_min: "",
    latency_max: "",
    has_error: false,
  });

  useEffect(() => {
    const id = setTimeout(() => {
      onChange({
        type: draft.type,
        method: draft.method,
        status_code: draft.status_code
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        path: draft.path,
        from: draft.from ? new Date(draft.from).toISOString() : "",
        to: draft.to ? new Date(draft.to).toISOString() : "",
        latency_min: draft.latency_min,
        latency_max: draft.latency_max,
        has_error: draft.has_error ? "true" : "",
      });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function set(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleMethod(method) {
    setDraft((current) => ({
      ...current,
      method: current.method.includes(method)
        ? current.method.filter((m) => m !== method)
        : [...current.method, method],
    }));
  }

  const isManualOnly = draft.type === "manual";

  return (
    <div className="filters-bar">
      <div className="filters-tabs">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            className={"filters-tab pressable" + (draft.type === tab.value ? " is-active" : "")}
            onClick={() => set("type", tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="filters-grid">
        {!isManualOnly && (
          <div className="filters-methods">
            {METHODS.map((method) => (
              <button
                key={method}
                className={"filters-chip pressable" + (draft.method.includes(method) ? " is-active" : "")}
                onClick={() => toggleMethod(method)}
              >
                {method}
              </button>
            ))}
          </div>
        )}

        <div className="filters-row">
          <input
            type="text"
            placeholder={isManualOnly ? "Buscar en mensaje (proximamente)" : "Buscar en path..."}
            value={draft.path}
            onChange={(event) => set("path", event.target.value)}
            className="filters-input"
            disabled={isManualOnly}
          />

          {!isManualOnly && (
            <input
              type="text"
              placeholder="Status codes (200,404)"
              value={draft.status_code}
              onChange={(event) => set("status_code", event.target.value)}
              className="filters-input filters-input-sm"
            />
          )}

          <input
            type="datetime-local"
            value={draft.from}
            onChange={(event) => set("from", event.target.value)}
            className="filters-input filters-input-sm"
            title="Desde"
          />
          <input
            type="datetime-local"
            value={draft.to}
            onChange={(event) => set("to", event.target.value)}
            className="filters-input filters-input-sm"
            title="Hasta"
          />

          {!isManualOnly && (
            <>
              <input
                type="number"
                placeholder="Lat. min"
                value={draft.latency_min}
                onChange={(event) => set("latency_min", event.target.value)}
                className="filters-input filters-input-xs"
              />
              <input
                type="number"
                placeholder="Lat. max"
                value={draft.latency_max}
                onChange={(event) => set("latency_max", event.target.value)}
                className="filters-input filters-input-xs"
              />
              <label className="filters-checkbox">
                <input
                  type="checkbox"
                  checked={draft.has_error}
                  onChange={(event) => set("has_error", event.target.checked)}
                />
                Solo errores
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
