import { useState } from "react";
import { Card } from "../../common/Card/Card.jsx";
import { StatTile } from "../../common/StatTile/StatTile.jsx";
import { LineChart } from "../../common/LineChart/LineChart.jsx";
import { RankedTable } from "../../common/RankedTable/RankedTable.jsx";
import { StateMessage } from "../../common/StateMessage/StateMessage.jsx";
import { Spinner } from "../../common/Spinner/Spinner.jsx";
import { MethodBadge, StatusBadge } from "../../common/Badge/Badge.jsx";
import { useMetrics } from "../../hooks/useMetrics.js";
import { useRecentErrors } from "../../hooks/useRecentErrors.js";
import { formatDateTime, formatRelativeTime } from "../../utils/format.js";
import "./DashboardPage.css";

const TOTAL_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19h16M7 19V9M12 19V5M17 19v-7" />
  </svg>
);
const RATE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
  </svg>
);
const ERROR_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  </svg>
);
const UPTIME_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

function minuteLabel(iso) {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function sortedEntries(record) {
  return Object.entries(record ?? {})
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
}

function RecentErrorRow({ record, onNavigate }) {
  const isManual = record.type === "manual";
  return (
    <tr className="fade-in" onClick={() => onNavigate("requests", record.id)}>
      <td>{isManual ? <span className="badge badge-status-critical">ERROR</span> : <StatusBadge statusCode={record.status_code} />}</td>
      <td>{!isManual && <MethodBadge method={record.method} />}</td>
      <td className="recent-error-path" title={isManual ? record.message : record.path}>
        {isManual ? record.message : record.path}
      </td>
      <td className="tabular">{formatDateTime(record.timestamp)}</td>
    </tr>
  );
}

/** RF-03: vista principal del dashboard, con auto-refresh pausable de metricas/errores recientes. */
export function DashboardPage({ onNavigate }) {
  const [paused, setPaused] = useState(false);
  const { data: metrics, error: metricsError, loading: metricsLoading, lastUpdated } = useMetrics({ paused });
  const { data: recentErrors, loading: errorsLoading, error: errorsError } = useRecentErrors({ paused });

  if (metricsError && !metrics) return <StateMessage kind="error">{metricsError}</StateMessage>;

  const requestsTimeline = metrics?.timeline.map((b) => ({ label: minuteLabel(b.minute), value: b.count })) ?? [];
  const latencyTimeline = metrics?.timeline.map((b) => ({ label: minuteLabel(b.minute), value: b.avg_latency_ms })) ?? [];
  const methodEntries = sortedEntries(metrics?.requests.by_method);
  const statusEntries = sortedEntries(metrics?.requests.by_status);

  return (
    <>
      <div className="dashboard-toolbar">
        <h1 className="dashboard-title">Dashboard</h1>
        <div className="dashboard-live">
          {metricsLoading ? (
            <Spinner size={16} />
          ) : (
            <span className={`live-dot${paused ? "" : " is-live"}`} />
          )}
          <span>{lastUpdated ? `Actualizado ${formatRelativeTime(lastUpdated)}` : "Cargando..."}</span>
          <button className="dashboard-pause" onClick={() => setPaused((p) => !p)}>
            {paused ? "Reanudar" : "Pausar"}
          </button>
        </div>
      </div>

      <div className="dashboard-stats">
        <StatTile label="Total requests" value={metrics?.requests.total ?? 0} icon={TOTAL_ICON} tone="series-1" />
        <StatTile label="Tasa / min" value={metrics?.requests.rate_per_minute ?? 0} icon={RATE_ICON} tone="series-7" />
        <StatTile label="Errores 5xx" value={metrics?.errors.total_5xx ?? 0} icon={ERROR_ICON} tone="status-critical" />
        <StatTile
          label="Uptime"
          value={Math.floor((metrics?.system.uptime_seconds ?? 0) / 60)}
          suffix=" min"
          icon={UPTIME_ICON}
          tone="status-good"
        />
      </div>

      <div className="grid-2">
        <Card title="Timeline de Requests" subtitle="Requests por minuto, ultima hora">
          <LineChart points={requestsTimeline} colorVar="--series-1" />
        </Card>
        <Card title="Performance" subtitle="Latencia promedio en el tiempo">
          <LineChart points={latencyTimeline} colorVar="--series-7" valueFormatter={(v) => `${Math.round(v)}ms`} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Distribucion por Metodo">
          <RankedTable entries={methodEntries} valueKey="count" valueLabel="Requests" colorVar="--series-1" />
        </Card>
        <Card title="Distribucion por Status">
          <RankedTable entries={statusEntries} valueKey="count" valueLabel="Requests" colorVar="--series-4" />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Top Endpoints">
          <RankedTable entries={metrics?.top_endpoints ?? []} valueKey="count" valueLabel="Requests" colorVar="--series-3" />
        </Card>
        <Card title="Endpoints Lentos">
          <RankedTable
            entries={metrics?.slowest_endpoints ?? []}
            valueKey="avg_latency_ms"
            valueLabel="Latencia"
            formatValue={(v) => `${v.toFixed(1)}ms`}
            colorVar="--series-8"
          />
        </Card>
      </div>

      <Card title="Errores Recientes">
        {errorsError && <StateMessage kind="error">{errorsError}</StateMessage>}
        {!errorsError && !errorsLoading && recentErrors.length === 0 && <StateMessage>Sin errores recientes.</StateMessage>}
        {!errorsError && recentErrors.length > 0 && (
          <div className="recent-errors scrollx">
            <table>
              <tbody>
                {recentErrors.map((record) => (
                  <RecentErrorRow key={record.id} record={record} onNavigate={onNavigate} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
