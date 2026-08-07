import { ThemeToggle } from "../../common/ThemeToggle/ThemeToggle.jsx";
import "./NavBar.css";

const LINKS = [
  { page: "dashboard", label: "Dashboard" },
  { page: "requests", label: "Requests" },
];

export function NavBar({ activePage, onNavigate, onLogout }) {
  return (
    <header className="navbar">
      <div className="navbar-brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 12l4-8 4 8-4 8-4-8zm8 0l4-8 4 8-4 8-4-8z"
            stroke="var(--series-1)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <span>ApiScope</span>
      </div>

      <nav className="navbar-links">
        {LINKS.map((link) => (
          <button
            key={link.page}
            className={"navbar-link" + (activePage === link.page ? " is-active" : "")}
            onClick={() => onNavigate(link.page)}
          >
            {link.label}
          </button>
        ))}
      </nav>

      <div className="navbar-actions">
        <ThemeToggle />
        {onLogout && (
          <button className="navbar-logout" onClick={onLogout} title="Cerrar sesion">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hide-mobile">Salir</span>
          </button>
        )}
      </div>
    </header>
  );
}
