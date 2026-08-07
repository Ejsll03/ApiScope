import { useState } from "react";
import "./LoginForm.css";

export function LoginForm({ onSubmit, error, pending }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!username || !password) return;
    onSubmit(username, password);
  }

  return (
    <div className="login-screen">
      <form className="login-card fade-in" onSubmit={handleSubmit}>
        <div className="login-logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12l4-8 4 8-4 8-4-8zm8 0l4-8 4 8-4 8-4-8z"
              stroke="var(--series-1)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1>ApiScope Monitoring</h1>
        <p className="login-subtitle">Ingresa tus credenciales para ver el dashboard</p>

        <label className="login-field">
          <span>Usuario</span>
          <input
            autoFocus
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>

        <label className="login-field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="login-error fade-in">{error}</div>}

        <button type="submit" className="login-submit" disabled={pending}>
          {pending ? "Verificando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
