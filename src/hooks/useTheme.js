import { useEffect, useState } from "react";

const KEY = "handysolver-theme"; // "light" | "dark"; missing = follow the system
const media = () => window.matchMedia?.("(prefers-color-scheme: dark)");

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** Puts the "dark" class on <html>. index.html runs the same check before React loads, so there's no flash. */
function apply(choice) {
  const dark = choice ? choice === "dark" : Boolean(media()?.matches);
  document.documentElement.classList.toggle("dark", dark);
  return dark;
}

/** Light/dark theme: follows the system until the user picks one, then remembers it. */
export function useTheme() {
  const [choice, setChoice] = useState(read);
  const [dark, setDark] = useState(() => apply(read()));

  useEffect(() => {
    setDark(apply(choice));
    if (choice) return;
    // No saved choice: keep following the system setting.
    const m = media();
    const onChange = () => setDark(apply(null));
    m?.addEventListener("change", onChange);
    return () => m?.removeEventListener("change", onChange);
  }, [choice]);

  const toggle = () => {
    const next = dark ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* still switches for this visit */
    }
    setChoice(next);
  };

  return { dark, toggle };
}
