const AUTH_STORAGE_KEY = "apiscope.auth";

/**
 * La SPA se sirve exactamente en la raiz del monitoring router (ver
 * `backend/src/monitoring/router.ts`, `GET /`), asi que `window.location`
 * ya esta parada en el mismo mount path que el resto de los endpoints
 * (`/metrics`, `/requests`, ...). No hace falta configurar una base URL:
 * basta con el path actual, sin la barra final.
 */
const BASE_PATH = window.location.pathname.replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeader() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return {};
  try {
    const session = JSON.parse(raw);
    if (!session.basic || Date.now() > session.expiresAt) return {};
    return { Authorization: `Basic ${session.basic}` };
  } catch {
    return {};
  }
}

function buildUrl(path, params) {
  const url = new URL(BASE_PATH + path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        if (value.length > 0) url.searchParams.set(key, value.join(","));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request(path, { params } = {}) {
  const res = await fetch(buildUrl(path, params), { headers: { ...authHeader() } });
  if (res.status === 401) {
    throw new ApiError(401, "No autorizado");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || `La API respondio ${res.status}`);
  }
  return res.json();
}

export const api = {
  getMetrics: () => request("/metrics"),
  getRequests: (options) => request("/requests", { params: options }),
  getRequestById: (id) => request(`/requests/${encodeURIComponent(id)}`),
};

export { AUTH_STORAGE_KEY };
