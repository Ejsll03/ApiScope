import { useTheme } from "./useTheme.js";
import "./ThemeToggle.css";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  return (
    <button className="theme-toggle" onClick={toggle} title="Cambiar tema" aria-label="Cambiar tema">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={isDark ? "spin-in" : ""}>
        {isDark ? (
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill="var(--text-secondary)"
          />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.5" fill="var(--text-secondary)" />
            <g stroke="var(--text-secondary)" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
            </g>
          </>
        )}
      </svg>
    </button>
  );
}
