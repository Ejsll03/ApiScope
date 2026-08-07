import { useCountUp } from "./useCountUp.js";
import "./StatTile.css";

function formatCompact(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("es");
}

export function StatTile({ label, value, decimals = 0, suffix = "", icon, tone = "series-1" }) {
  const animated = useCountUp(value, decimals);
  const formatted = decimals > 0 ? animated.toFixed(decimals) : formatCompact(animated);

  return (
    <div className="stat-tile fade-in">
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
