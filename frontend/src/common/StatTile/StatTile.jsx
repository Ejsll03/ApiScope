import { useEffect, useRef, useState } from "react";
import { useCountUp } from "./useCountUp.js";
import "./StatTile.css";

function formatCompact(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("es");
}

/**
 * `tone="status-critical"` marca tiles que reportan errores (ver
 * DashboardPage: "Errores 5xx"). Ahi, ademas del count-up generico, un
 * pulso corto de una sola vez llama la atencion cuando el valor SUBE --
 * es la senal que mas importa en un dashboard de monitoreo. No se
 * excluye bajo prefers-reduced-motion: es un solo blip de color/sombra,
 * no un loop ni un desplazamiento, y comunica un cambio de estado real.
 */
export function StatTile({ label, value, decimals = 0, suffix = "", icon, tone = "series-1" }) {
  const animated = useCountUp(value, decimals);
  const formatted = decimals > 0 ? animated.toFixed(decimals) : formatCompact(animated);

  const previousValue = useRef(value);
  const [alert, setAlert] = useState(false);

  useEffect(() => {
    if (tone === "status-critical" && typeof value === "number" && value > previousValue.current) {
      setAlert(true);
      const id = setTimeout(() => setAlert(false), 700);
      previousValue.current = value;
      return () => clearTimeout(id);
    }
    previousValue.current = value;
    return undefined;
  }, [value, tone]);

  return (
    <div className={`stat-tile fade-in${alert ? " stat-tile-alert" : ""}`}>
      <div className={`stat-tile-icon tone-${tone}`}>{icon}</div>
      <div>
        <div className="stat-tile-value">
          {formatted}
          {suffix}
        </div>
        <div className="stat-tile-label">{label}</div>
      </div>
    </div>
  );
}
