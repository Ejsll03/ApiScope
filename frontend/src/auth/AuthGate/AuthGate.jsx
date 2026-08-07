import { LoginForm } from "../LoginForm/LoginForm.jsx";
import { Spinner } from "../../common/Spinner/Spinner.jsx";
import { useAuth } from "../useAuth.js";
import "./AuthGate.css";

/**
 * Decide que se renderiza segun el estado de auth (RF-03):
 *  - "checking": primer probe a /metrics todavia en vuelo.
 *  - "anonymous": monitoring.auth.enabled es false -> acceso publico.
 *  - "authenticated": credenciales validas guardadas en localStorage.
 *  - "login-required": auth habilitado y sin sesion (o sesion vencida/invalida).
 *  - "error": la API de monitoreo no respondio (no es un tema de credenciales).
 * `children` recibe `{ logout }` para que el resto de la app pueda ofrecer
 * un boton de cerrar sesion visible, como pide el PRD.
 */
export function AuthGate({ children }) {
  const { status, error, login, logout, retry } = useAuth();

  if (status === "checking") {
    return (
      <div className="auth-splash">
        <Spinner size={28} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="auth-splash">
        <div className="auth-error-card fade-in">
          <p>{error}</p>
          <button onClick={retry}>Reintentar</button>
        </div>
      </div>
    );
  }

  if (status === "login-required") {
    return <LoginForm onSubmit={login} error={error} pending={false} />;
  }

  return children({ logout, isAnonymous: status === "anonymous" });
}
