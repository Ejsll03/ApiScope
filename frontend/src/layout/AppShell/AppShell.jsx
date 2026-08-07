import { NavBar } from "../NavBar/NavBar.jsx";
import "./AppShell.css";

export function AppShell({ route, onNavigate, onLogout, children }) {
  return (
    <div className="app-shell">
      <NavBar activePage={route.page} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="app-content">
        <div key={`${route.page}/${route.param ?? ""}`} className="app-content-inner fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
