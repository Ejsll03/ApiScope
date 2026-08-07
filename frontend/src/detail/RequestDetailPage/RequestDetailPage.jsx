import { Card } from "../../common/Card/Card.jsx";
import { StateMessage } from "../../common/StateMessage/StateMessage.jsx";
import { Spinner } from "../../common/Spinner/Spinner.jsx";
import { MethodBadge, StatusBadge, LevelBadge } from "../../common/Badge/Badge.jsx";
import { KeyValueTable } from "../../common/KeyValueTable/KeyValueTable.jsx";
import { JsonViewer } from "../JsonViewer/JsonViewer.jsx";
import { useRequestDetail } from "../../hooks/useRequestDetail.js";
import { formatBytes, formatDateTime } from "../../utils/format.js";
import "./RequestDetailPage.css";

function BackButton({ onBack }) {
  return (
    <button className="detail-back" onClick={onBack}>
      ← Volver a requests
    </button>
  );
}

function RequestDetail({ record }) {
  const hasError = record.status_code >= 400;
  return (
    <>
      <Card title="General">
        <dl className="detail-fields">
          <dt>Request ID</dt>
          <dd className="mono">{record.id}</dd>
          <dt>Timestamp</dt>
          <dd>{formatDateTime(record.timestamp)}</dd>
          <dt>Metodo</dt>
          <dd>
            <MethodBadge method={record.method} />
          </dd>
          <dt>Path completo</dt>
          <dd className="mono">{record.full_url}</dd>
          <dt>Status</dt>
          <dd>
            <StatusBadge statusCode={record.status_code} />
          </dd>
        </dl>
      </Card>

      <div className="grid-2">
        <Card title="Performance">
          <dl className="detail-fields">
            <dt>Latencia</dt>
            <dd>{record.latency_ms}ms</dd>
            <dt>Tamano de response</dt>
            <dd>{formatBytes(record.response_size_bytes)}</dd>
          </dl>
        </Card>
        <Card title="Client Info">
          <dl className="detail-fields">
            <dt>IP</dt>
            <dd className="mono">{record.client_ip}</dd>
            <dt>User-Agent</dt>
            <dd className="mono">{record.user_agent}</dd>
          </dl>
        </Card>
      </div>

      <Card title="Request Info">
        <div className="detail-subsections">
          <div>
            <h3>Headers</h3>
            <KeyValueTable data={record.request_headers} />
          </div>
          <div>
            <h3>Query params</h3>
            <KeyValueTable data={record.request_query} />
          </div>
          <div>
            <h3>Body</h3>
            <JsonViewer value={record.request_body} />
          </div>
        </div>
      </Card>

      <Card title="Response Info">
        <div className="detail-subsections">
          <div>
            <h3>Headers</h3>
            <KeyValueTable data={record.response_headers} />
          </div>
          <div>
            <h3>Body</h3>
            <JsonViewer value={record.response_body} />
          </div>
        </div>
      </Card>

      {hasError && (
        <Card title="Error Info" className="detail-error-card">
          <dl className="detail-fields">
            <dt>Mensaje</dt>
            <dd>{record.error_message || "-"}</dd>
          </dl>
          {record.stack_trace && (
            <pre className="detail-stack scrollx">
              <code>{record.stack_trace}</code>
            </pre>
          )}
        </Card>
      )}
    </>
  );
}

function ManualDetail({ record }) {
  return (
    <>
      <Card title="General">
        <dl className="detail-fields">
          <dt>ID</dt>
          <dd className="mono">{record.id}</dd>
          <dt>Timestamp</dt>
          <dd>{formatDateTime(record.timestamp)}</dd>
          <dt>Nivel</dt>
          <dd>
            <LevelBadge level={record.level} />
          </dd>
          <dt>Mensaje</dt>
          <dd>{record.message}</dd>
        </dl>
      </Card>

      {record.context && (record.context.file || record.context.function) && (
        <Card title="Contexto de ejecucion">
          <dl className="detail-fields">
            <dt>Archivo</dt>
            <dd className="mono">{record.context.file ?? "-"}</dd>
            <dt>Linea</dt>
            <dd>{record.context.line ?? "-"}</dd>
            <dt>Funcion</dt>
            <dd className="mono">{record.context.function ?? "-"}</dd>
          </dl>
        </Card>
      )}

      <Card title="Metadata">
        <JsonViewer value={record.metadata} />
      </Card>

      {record.stack_trace && (
        <Card title="Stack trace" className="detail-error-card">
          <pre className="detail-stack scrollx">
            <code>{record.stack_trace}</code>
          </pre>
        </Card>
      )}
    </>
  );
}

export function RequestDetailPage({ id, onBack }) {
  const { data: record, loading, error } = useRequestDetail(id);

  return (
    <>
      <BackButton onBack={onBack} />

      {loading && (
        <div className="detail-loading">
          <Spinner size={26} />
        </div>
      )}

      {error && <StateMessage kind="error">{error}</StateMessage>}

      {record && (record.type === "manual" ? <ManualDetail record={record} /> : <RequestDetail record={record} />)}
    </>
  );
}
