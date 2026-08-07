import { useEffect, useState } from "react";

/**
 * Devuelve 0 en el primer render y `target` un frame despues, para que un
 * `width`/`transform` con `transition` en CSS anime la entrada del dato en
 * vez de aparecer ya dibujado.
 */
export function useMountedValue(target) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setValue(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return value;
}
