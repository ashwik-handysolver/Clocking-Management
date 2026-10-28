import { useEffect, useState } from "react";

const KEY = "handysolver-theme"; // "light" | "dark"; missing = light
const EVENT = "handysolver-theme-change";

function read() {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Puts the "dark" class on <html>. index.html runs the same check before React loads, so there's no flash. */
function apply(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Light/dark theme: light by default; whatever the user picks is remembered in this browser for
 * next time. Every place that uses this hook (header toggle, profile menu) stays in step.
 */
export function useTheme() {
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const sync = () => setTheme(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync); // another tab changed it
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => apply(theme), [theme]);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* still switches for this visit */
    }
    setTheme(next);
    window.dispatchEvent(new Event(EVENT));
  };

  return { dark: theme === "dark", toggle };
}
