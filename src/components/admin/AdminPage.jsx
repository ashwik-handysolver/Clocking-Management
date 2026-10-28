import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { Button, Card, EmptyState, cx } from "../ui";

/** Frame for admin-only pages: a heading, an optional action, and a guard for everyone else. */
export function AdminPage({ title, text, action, children }) {
  const { me } = useStore();
  if (!isAdmin(me)) {
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
export function Segmented({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-stone-100 p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cx(
            "rounded-full px-3.5 py-1.5 text-xs font-bold transition",
            value === key ? "bg-surface text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
