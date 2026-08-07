import { MethodBadge, StatusBadge, LevelBadge } from "../../common/Badge/Badge.jsx";
import { StateMessage } from "../../common/StateMessage/StateMessage.jsx";
import { formatDateTime } from "../../utils/format.js";
import "./RequestsTable.css";

function RequestRow({ record, onSelect, style }) {
  return (
    <tr className="fade-in" style={style} onClick={() => onSelect(record.id)}>
      <td>
        <MethodBadge method={record.method} />
      </td>
      <td className="requests-path" title={record.path}>
        {record.path}
      </td>
      <td>
        <StatusBadge statusCode={record.status_code} />
      </td>
      <td className="tabular">{record.latency_ms}ms</td>
      <td className="tabular">{formatDateTime(record.timestamp)}</td>
    </tr>
  );
}

function ManualRow({ record, onSelect, style }) {
  return (
    <tr className="fade-in is-manual" style={style} onClick={() => onSelect(record.id)}>
      <td>
        <LevelBadge level={record.level} />
      </td>
      <td className="requests-path" colSpan={2} title={record.message}>
        {record.message}
      </td>
      <td className="tabular">-</td>
      <td className="tabular">{formatDateTime(record.timestamp)}</td>
    </tr>
  );
}

/** RF-03/RF-05: tabla mixta (requests capturadas + logs manuales, discriminados por `type`). */
export function RequestsTable({ data, loading, error, onSelect }) {
  if (error) return <StateMessage kind="error">{error}</StateMessage>;
  if (!loading && data.length === 0) return <StateMessage>No hay registros con estos filtros.</StateMessage>;

  return (
    <div className="requests-table scrollx">
      <table>
        <thead>
          <tr>
            <th>Metodo / Nivel</th>
            <th colSpan={2}>Path / Mensaje</th>
            <th>Latencia</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {loading && data.length === 0
            ? [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <div className="skeleton" style={{ height: 18 }} />
                  </td>
                </tr>
              ))
            : data.map((record, index) => {
                const rowProps = {
                  key: record.id,
                  record,
                  onSelect,
                  style: { animationDelay: `${Math.min(index, 12) * 25}ms` },
                };
                return record.type === "manual" ? <ManualRow {...rowProps} /> : <RequestRow {...rowProps} />;
              })}
        </tbody>
      </table>
    </div>
  );
}
