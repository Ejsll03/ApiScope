import "./Badge.css";

const METHOD_CLASS = {
  GET: "series-1",
  POST: "series-3",
  PUT: "series-4",
  PATCH: "series-7",
  DELETE: "series-8",
  OPTIONS: "series-5",
  HEAD: "series-6",
};

export function MethodBadge({ method }) {
  return <span className={`badge badge-${METHOD_CLASS[method] ?? "series-1"}`}>{method}</span>;
}

function statusRole(statusCode) {
  if (statusCode >= 500) return "critical";
  if (statusCode >= 400) return "warning";
  if (statusCode >= 300) return "neutral";
  return "good";
}

export function StatusBadge({ statusCode }) {
  return <span className={`badge badge-status-${statusRole(statusCode)}`}>{statusCode}</span>;
}

export function LevelBadge({ level }) {
  const role = level === "ERROR" ? "critical" : level === "WARNING" ? "warning" : level === "DEBUG" ? "neutral" : "good";
  return <span className={`badge badge-status-${role}`}>{level}</span>;
}
