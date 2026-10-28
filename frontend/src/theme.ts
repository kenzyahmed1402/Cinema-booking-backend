import { useCallback, useEffect, useState } from "react";

// public/theme.js sets the first theme before the page draws; this keeps it
// in step afterwards
export type Theme = "light" | "dark";

const KEY = "theme";
const BAR_COLOURS: Record<Theme, string> = { light: "#ffffff", dark: "#0a0a0c" };

const saved = (): Theme | null => {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
};

const deviceQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

const apply = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  document.getElementById("themeColor")?.setAttribute("content", BAR_COLOURS[theme]);
};

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );

  // Follow the device's setting until the visitor picks a theme here
  useEffect(() => {
    const query = deviceQuery();
    const follow = (event: MediaQueryListEvent) => {
      if (saved()) return;
      const next = event.matches ? "dark" : "light";
      apply(next);
      setTheme(next);
    };
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private windows may refuse storage: the switch still works for this visit
    }
    apply(next);
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
};
