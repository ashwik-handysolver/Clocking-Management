import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useStore } from "../../store/store";
import { runningEntryOf } from "../../store/model";
import { cx } from "../ui";

/**
 * Shown while the browser is offline, and briefly once it's back.
 * Offline, nothing can be saved; screenshots are kept and uploaded later, and a long outage
 * stops the timer at the last check-in (it starts again by itself once the connection returns).
 */
export default function OfflineBanner() {
  const { state, me } = useStore();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [backAt, setBackAt] = useState(0);
  const clocking = Boolean(runningEntryOf(state.entries, me.id));

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      setBackAt(Date.now());
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // "Back online" shows for 4 seconds.
  useEffect(() => {
    if (!backAt) return;
    const t = setTimeout(() => setBackAt(0), 4000);
    return () => clearTimeout(t);
  }, [backAt]);

  if (online && !backAt) return null;
  return (
    <div
      role="status"
      className={cx(
        "mt-3 flex animate-fade-in items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-soft ring-1",
        online ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200",
      )}
    >
      {online ? <Wifi className="mt-0.5 size-4 shrink-0" /> : <WifiOff className="mt-0.5 size-4 shrink-0" />}
      {online ? (
        <p className="font-semibold">Back online. Everything is up to date again.</p>
      ) : (
        <p>
          <span className="font-bold">You're offline.</span> Changes can't be saved until the connection is back.
          {clocking && " Keep this tab open: screenshots are kept and uploaded later. If you're offline for more than 2 minutes, that time isn't counted; your timer starts again by itself once you're back."}
        </p>
      )}
    </div>
  );
}
