import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "apiscope.theme";

function systemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "system");

  useEffect(() => {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const effectiveDark = current === "dark" || (current === "system" && systemPrefersDark());
      const next = effectiveDark ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
  return { isDark, toggle };
}
