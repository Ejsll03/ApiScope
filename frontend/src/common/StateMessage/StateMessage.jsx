import "./StateMessage.css";

export function StateMessage({ kind = "empty", children }) {
  return <div className={`state-message state-message-${kind} fade-in`}>{children}</div>;
}
