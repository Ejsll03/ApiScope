import { useEffect, useRef, useState } from "react";

/** Anima un numero desde su valor previo hasta el nuevo en ~500ms (ease-out). */
export function useCountUp(value, decimals = 0) {
  const [display, setDisplay] = useState(value ?? 0);
  const previous = useRef(value ?? 0);
  const frame = useRef();

  useEffect(() => {
    if (typeof value !== "number" || Number.isNaN(value)) return undefined;
    const from = previous.current;
    const to = value;
    const start = performance.now();
    const duration = 500;

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        previous.current = to;
      }
    }
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return Number(display.toFixed(decimals));
}
