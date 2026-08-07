import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, AUTH_STORAGE_KEY } from "../api/client.js";

/**
 * RF-03 no exige JWT/OAuth, solo Basic Auth con sesion por localStorage y
 * timeout configurable (default 1h). El backend no expone
 * `session_timeout_hours` via API (no es parte de /metrics), asi que el
 * frontend usa el mismo default documentado en RF-06 -- si el equipo
 * quiere otro valor, cambia esta constante.
 */
const DEFAULT_SESSION_HOURS = 1;
const EXPIRY_CHECK_MS = 30_000;

function loadSession() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session.basic || Date.now() > session.expiresAt) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function useAuth() {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const probe = useCallback(async () => {
    setStatus("checking");
    setError(null);
    const hadSession = loadSession() !== null;
    try {
      await api.getMetrics();
      setStatus(hadSession ? "authenticated" : "anonymous");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setStatus("login-required");
      } else {
        setError(err.message ?? "No se pudo conectar con la API de monitoreo.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  // Sesion basada en localStorage: si expira mientras la SPA sigue abierta,
  // fuerza logout aunque el usuario no haga ninguna accion.
  useEffect(() => {
    const id = setInterval(() => {
      if (statusRef.current === "authenticated" && loadSession() === null) {
        setStatus("login-required");
      }
    }, EXPIRY_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  const login = useCallback(async (username, password, sessionHours = DEFAULT_SESSION_HOURS) => {
    const basic = btoa(`${username}:${password}`);
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ basic, expiresAt: Date.now() + sessionHours * 3_600_000 })
    );
    try {
      await api.getMetrics();
      setError(null);
      setStatus("authenticated");
      return true;
    } catch (err) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setError(
        err instanceof ApiError && err.status === 401
          ? "Usuario o contraseña incorrectos."
          : (err.message ?? "No se pudo iniciar sesion.")
      );
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setStatus("login-required");
  }, []);

  return { status, error, login, logout, retry: probe };
}
