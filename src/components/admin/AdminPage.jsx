import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { Button, Card, EmptyState, cx } from "../ui";

/** Page frame: a heading and an optional action. Admin-only unless `everyone` is set (then each page limits what it shows). */
export function AdminPage({ title, text, action, everyone = false, children }) {
  const { me } = useStore();
  if (!everyone && !isAdmin(me)) {
    return (
      <Card>
        <EmptyState icon={ShieldCheck} title="Admins only" />
      </Card>
    );
  }
  return (
    // @container: the tables inside lay out by this page's width.
    <div className="@container space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-stone-900">{title}</h1>
          {text && <p className="text-sm text-stone-500">{text}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** "1–15 of 42" with previous / next. Renders nothing when everything fits on one page. */
export function Pager({ page, total, perPage, onPage }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-100 pt-3 text-xs text-stone-500">
      <span className="tabular-nums">
        {page * perPage + 1}–{Math.min(total, (page + 1) * perPage)} of {total}
      </span>
      <span className="flex gap-1">
        <Button size="xs" variant="ghost" icon={ChevronLeft} disabled={page === 0} onClick={() => onPage(page - 1)}>
          Newer
        </Button>
        <Button size="xs" variant="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Older <ChevronRight className="size-3.5" />
        </Button>
      </span>
    </div>
  );
}

/** Small pill tabs. `options` is a list of [value, label]. */
/** Pill-shaped switch between a few options; the white highlight glides to the one you pick. */
export function Segmented({ value, options, onChange, label, size = "md" }) {
  const wrap = useRef(null);
  const [pill, setPill] = useState(null); // { left, width } of the chosen option
  const [glide, setGlide] = useState(false); // no gliding on the first placement
  const labels = options.map((o) => o[1]).join("|");

  useLayoutEffect(() => {
    const place = () => {
      const el = wrap.current?.querySelector('[aria-pressed="true"]');
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    place();
    const t = setTimeout(() => setGlide(true), 20);
    // Re-measure when the switch changes size (fonts loading, labels changing, window resizing).
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(wrap.current);
    return () => {
      clearTimeout(t);
      ro?.disconnect();
    };
  }, [value, labels]);

  return (
    <div ref={wrap} role="group" aria-label={label} className={cx("relative inline-flex rounded-full bg-stone-100", size === "sm" ? "p-0.5" : "p-1")}>
      {pill && (
        <span
          aria-hidden="true"
          className={cx("absolute rounded-full bg-surface shadow-sm", size === "sm" ? "inset-y-0.5" : "inset-y-1", glide && "transition-[left,width] duration-300 ease-smooth")}
          style={pill}
        />
      )}
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cx(
            "relative rounded-full text-xs font-bold transition-colors",
            size === "sm" ? "px-3 py-1" : "px-3.5 py-1.5",
            value === key ? "text-stone-900" : "text-stone-500 hover:text-stone-800",
            !pill && value === key && "bg-surface shadow-sm", // before the highlight is measured
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
