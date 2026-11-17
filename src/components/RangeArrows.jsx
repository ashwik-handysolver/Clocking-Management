import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, fromDateKey, startOfWeek, toDateKey } from "../lib/time";

/**
 * The [from, to] ("YYYY-MM-DD") one day or one week before (dir -1) or after (dir 1) the one showing.
 * Weeks run Monday to Sunday; nothing goes past today.
 */
export function stepRange(kind, from, dir) {
  const today = toDateKey(Date.now());
  if (kind === "day") {
    const d = toDateKey(addDays(fromDateKey(from), dir));
    return d > today ? null : [d, d];
  }
  const start = addDays(startOfWeek(fromDateKey(from)), dir * 7);
  const first = toDateKey(start);
  if (first > today) return null;
  const last = toDateKey(addDays(start, 6));
  return [first, last > today ? today : last];
}

/** ‹ › buttons that step a day or week range. `onStep([from, to])`. */
export default function RangeArrows({ kind, from, to, onStep }) {
  const atToday = to >= toDateKey(Date.now());
  const btn =
    "grid size-8 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:pointer-events-none disabled:opacity-30";
  const go = (dir) => {
    const r = stepRange(kind, from, dir);
    if (r) onStep(r);
  };
  return (
    <span className="flex items-center gap-1">
      <button type="button" aria-label={`Previous ${kind}`} onClick={() => go(-1)} className={btn}>
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" aria-label={`Next ${kind}`} disabled={atToday} onClick={() => go(1)} className={btn}>
        <ChevronRight className="size-4" />
      </button>
    </span>
  );
}
