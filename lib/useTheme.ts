"use client";
import { useEffect, useState } from "react";

export type Theme = "modern" | "terminal";

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("modern");
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null) ?? "modern";
    setTheme(stored);
    document.documentElement.dataset.theme = stored;
  }, []);
  const set = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("theme", t);
    document.documentElement.dataset.theme = t;
  };
  return [theme, set];
}
