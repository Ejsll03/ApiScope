import { StateMessage } from "../StateMessage/StateMessage.jsx";
import "./RankedTable.css";

/** Tabla ordenada generica con una mini-barra de magnitud (Top Endpoints / Endpoints Lentos, RF-03). */
export function RankedTable({ entries, valueKey, valueLabel, formatValue = (v) => v, colorVar = "--series-1" }) {
  if (!entries || entries.length === 0) return <StateMessage>Sin datos todavia.</StateMessage>;
  const max = Math.max(...entries.map((entry) => entry[valueKey]));

  return (
    <div className="ranked-table scrollx">
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.path} style={{ animationDelay: `${index * 30}ms` }} className="fade-in">
              <td className="ranked-path" title={entry.path}>
                {entry.path}
              </td>
              <td>
                <div className="ranked-cell">
                  <div className="ranked-mini-track">
                    <div
                      className="ranked-mini-fill"
                      style={{ transform: `scaleX(${entry[valueKey] / max})`, background: `var(${colorVar})` }}
                    />
                  </div>
                  <span>{formatValue(entry[valueKey])}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
