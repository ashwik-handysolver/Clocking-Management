import { useEffect, useState } from "react";

/** Re-renders every `interval` ms while `active` is true; returns the current time. */
export function useNow(active = true, interval = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return active ? now : Date.now();
}
