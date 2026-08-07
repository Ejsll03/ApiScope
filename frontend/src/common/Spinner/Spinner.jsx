import "./Spinner.css";

export function Spinner({ size = 20 }) {
  return (
    <svg
      className="spinner"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Cargando"
    >
      <circle cx="12" cy="12" r="9" stroke="var(--gridline)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--series-1)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
