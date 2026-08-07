import { useCallback, useEffect, useState } from "react";

/**
 * Router minimo basado en hash: evita cargar react-router (peso extra en
 * un bundle que debe quedar bajo 500KB) para una SPA de solo tres vistas
 * (dashboard / lista / detalle). `#/requests/<id>` navega directo a la
 * vista de detalle, asi que un link a una request puntual es compartible.
 */
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [page, ...rest] = hash.split("/").filter(Boolean);
  return { page: page || "dashboard", param: rest[0] };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((page, param) => {
    window.location.hash = param ? `/${page}/${param}` : `/${page}`;
  }, []);

  return { ...route, navigate };
}
