import { StateMessage } from "../StateMessage/StateMessage.jsx";
import "./KeyValueTable.css";

export function KeyValueTable({ data }) {
  const entries = data && typeof data === "object" ? Object.entries(data) : [];
  if (entries.length === 0) return <StateMessage>Vacio.</StateMessage>;

  return (
    <div className="kv-table scrollx">
      <table>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>{typeof value === "object" ? JSON.stringify(value) : String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
