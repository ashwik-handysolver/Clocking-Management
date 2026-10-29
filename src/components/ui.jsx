import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Circle, CircleAlert, CircleCheck, CircleDot, Eye, Flag, Search, X } from "lucide-react";
import { initials } from "../store/model";

const cx = (...c) => c.filter(Boolean).join(" ");
export { cx };

/* ---------- Buttons ---------- */

const BTN_VARIANT = {
  primary: "bg-brand-500 text-white shadow-glow hover:bg-brand-600 active:transtone-y-px",
  secondary: "bg-surface text-stone-700 ring-1 ring-stone-200 shadow-sm hover:bg-stone-50 hover:ring-stone-300",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  ghost: "text-stone-500 hover:bg-stone-900/5 hover:text-stone-900",
  dark: "palette-fixed bg-stone-900 text-white hover:bg-stone-800",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  dangerGhost: "text-stone-400 hover:bg-red-50 hover:text-red-600",
};
const BTN_SIZE = {
  xs: "h-7 gap-1 rounded-lg px-2 text-xs",
  sm: "h-8 gap-1.5 rounded-xl px-3 text-xs",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-2xl px-6 text-sm",
};

export function Button({ variant = "secondary", size = "md", icon: Icon, iconOnly, className, children, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        iconOnly && "aspect-square !px-0",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={size === "lg" ? "size-[18px]" : size === "xs" ? "size-3.5" : "size-4"} strokeWidth={2.25} />}
      {children}
    </button>
  );
}

/* ---------- Status & priority ---------- */

export const STATUS_STYLE = {
  "To do": { pill: "bg-stone-100 text-stone-600", dot: "bg-stone-400", icon: Circle, color: "text-stone-400" },
  "In progress": { pill: "bg-brand-50 text-brand-700", dot: "bg-brand-500", icon: CircleDot, color: "text-brand-500" },
  "In review": { pill: "bg-violet-50 text-violet-700", dot: "bg-violet-500", icon: Eye, color: "text-violet-500" },
  Blocked: { pill: "bg-red-50 text-red-700", dot: "bg-red-500", icon: CircleAlert, color: "text-red-500" },
  Completed: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", icon: CircleCheck, color: "text-emerald-500" },
  Active: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", icon: CircleDot, color: "text-emerald-500" },
  "On hold": { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500", icon: Circle, color: "text-amber-500" },
};

export const PRIORITY_STYLE = {
  Low: "text-stone-400",
  Medium: "text-amber-500",
  High: "text-orange-600",
  Urgent: "text-red-600",
};

export function StatusIcon({ status, className }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE["To do"];
  const Icon = s.icon;
  return <Icon className={cx("shrink-0", s.color, className ?? "size-4")} strokeWidth={2.4} aria-label={status} />;
}

export function StatusDot({ status, className }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", STATUS_STYLE[status]?.dot ?? "bg-stone-300", className)} />;
}

export function PriorityLabel({ priority, compact }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-stone-600" title={`${priority} priority`}>
      <Flag className={cx("size-3.5", PRIORITY_STYLE[priority])} fill="currentColor" />
      {!compact && priority}
    </span>
  );
}

/** Coloured pill that opens the shared dropdown — quick inline edits. */
export function PillSelect({ value, options, onChange, styleFor, label, className, readOnly, readOnlyTitle }) {
  // Read-only: the same pill, without the menu (e.g. someone else's subtask).
  if (readOnly) {
    return (
      <span
        title={readOnlyTitle}
        onClick={(e) => e.stopPropagation()}
        className={cx("inline-flex items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap", styleFor?.(value) ?? "bg-stone-100 text-stone-700", className)}
      >
        {value}
      </span>
    );
  }
  return (
    <Listbox
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      optionClass={styleFor}
      renderTrigger={({ open, current }) => (
        <span
          className={cx(
            "inline-flex items-center gap-1 rounded-full py-1 pr-2 pl-3 text-xs font-bold whitespace-nowrap transition hover:brightness-95",
            open && "ring-2 ring-brand-500/40",
            styleFor?.(value) ?? "bg-stone-100 text-stone-700",
            className,
          )}
        >
          {current?.label ?? value}
          <ChevronDown className={cx("size-3 opacity-60 transition", open && "rotate-180")} strokeWidth={3} />
        </span>
      )}
    />
  );
}

/* ---------- People ---------- */

const AVATAR_SIZE = { xs: "size-5 text-[9px]", sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-11 text-sm", xl: "size-24 text-3xl" };

export function Avatar({ member, size = "md", ring, className }) {
  if (!member) return <span className={cx("inline-block rounded-full bg-stone-200", AVATAR_SIZE[size], className)} />;
  if (member.avatarUrl)
    return (
      <img
        src={member.avatarUrl}
        alt=""
        title={member.name}
        className={cx("inline-block shrink-0 rounded-full bg-stone-200 object-cover select-none", ring && "ring-2 ring-surface", AVATAR_SIZE[size], className)}
      />
    );
  return (
    <span
      title={member.name}
      style={{ background: `linear-gradient(135deg, ${member.color}, ${member.color}cc)` }}
      className={cx(
        "inline-grid shrink-0 place-items-center rounded-full font-bold text-white select-none",
        ring && "ring-2 ring-surface",
        AVATAR_SIZE[size],
        className,
      )}
    >
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, max = 4, size = "sm", ringClass = "ring-surface" }) {
  const shown = members.slice(0, max);
  return (
    <span className={cx("flex shrink-0", size === "xs" ? "-space-x-1.5" : "-space-x-2")}>
      {shown.map((m) => (
        <Avatar key={m.id} member={m} size={size} className={cx("ring-2", ringClass)} />
      ))}
      {members.length > max && (
        <span className={cx("grid place-items-center rounded-full bg-stone-100 font-bold text-stone-600 ring-2", AVATAR_SIZE[size], ringClass)}>
          +{members.length - max}
        </span>
      )}
    </span>
  );
}

/* ---------- Layout bits ---------- */

export function Card({ className, ...props }) {
  return <div className={cx("rounded-3xl bg-surface shadow-soft ring-1 ring-stone-900/5", className)} {...props} />;
}

/* ---------- Decorated cards: icon chip + tinted background + watermark icon ---------- */

export const TONE = {
  brand: { bg: "from-brand-50 via-surface to-surface", chip: "bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow", soft: "bg-brand-100 text-brand-600", mark: "text-brand-500/[0.07]", ring: "ring-brand-100" },
  emerald: { bg: "from-emerald-50 via-surface to-surface", chip: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_10px_24px_-8px_rgb(16_185_129/0.55)]", soft: "bg-emerald-100 text-emerald-600", mark: "text-emerald-500/[0.08]", ring: "ring-emerald-100" },
  amber: { bg: "from-amber-50 via-surface to-surface", chip: "bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-[0_10px_24px_-8px_rgb(245_158_11/0.55)]", soft: "bg-amber-100 text-amber-600", mark: "text-amber-500/[0.09]", ring: "ring-amber-100" },
  red: { bg: "from-red-50 via-surface to-surface", chip: "bg-gradient-to-br from-red-400 to-red-600 text-white shadow-[0_10px_24px_-8px_rgb(239_68_68/0.55)]", soft: "bg-red-100 text-red-600", mark: "text-red-500/[0.07]", ring: "ring-red-100" },
  violet: { bg: "from-violet-50 via-surface to-surface", chip: "bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-[0_10px_24px_-8px_rgb(139_92_246/0.55)]", soft: "bg-violet-100 text-violet-600", mark: "text-violet-500/[0.07]", ring: "ring-violet-100" },
  sky: { bg: "from-sky-50 via-surface to-surface", chip: "bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-[0_10px_24px_-8px_rgb(14_165_233/0.55)]", soft: "bg-sky-100 text-sky-600", mark: "text-sky-500/[0.08]", ring: "ring-sky-100" },
  stone: { bg: "from-stone-50 via-surface to-surface", chip: "palette-fixed bg-stone-800 text-white", soft: "bg-stone-100 text-stone-500", mark: "text-stone-900/[0.04]", ring: "ring-stone-100" },
};

export function IconChip({ icon: Icon, tone = "brand", variant = "solid", size = "md", className }) {
  const t = TONE[tone];
  const s = { sm: "size-8 rounded-xl [&>svg]:size-4", md: "size-10 rounded-2xl [&>svg]:size-5", lg: "size-12 rounded-2xl [&>svg]:size-6" }[size];
  return (
    <span className={cx("grid shrink-0 place-items-center", s, variant === "solid" ? t.chip : t.soft, className)}>
      <Icon strokeWidth={2.2} />
    </span>
  );
}

/** Big faded icon tucked into a card corner. Parent needs `relative overflow-hidden`. */
export function Watermark({ icon: Icon, tone = "brand", className }) {
  return (
    <Icon
      aria-hidden="true"
      strokeWidth={1.5}
      className={cx("pointer-events-none absolute -right-5 -bottom-6 size-32 rotate-[-12deg]", TONE[tone].mark, className)}
    />
  );
}

/** Card with a soft tinted gradient and a watermark icon. */
export function TintCard({ tone = "brand", icon, className, children, ...props }) {
  return (
    <Card className={cx("relative overflow-hidden bg-gradient-to-br", TONE[tone].bg, className)} {...props}>
      {icon && <Watermark icon={icon} tone={tone} />}
      <div className="relative flex h-full flex-col">{children}</div>
    </Card>
  );
}

/**
 * True once the element behind `ref` has scrolled into view (and stays true), so bars, rings and
 * numbers start from empty and fill up when you actually see them. Without IntersectionObserver
 * (or with reduced motion) it's true straight away.
 */
export function useInViewOnce(ref) {
  const [seen, setSeen] = useState(
    () => typeof IntersectionObserver === "undefined" || (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      // The huge top margin counts anything already scrolled past (above the screen) as seen,
      // so jumping to the bottom of a page doesn't leave numbers at 0.
      { rootMargin: "100000px 0px -40px 0px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, ref]);
  return seen;
}

export function ProgressBar({ value, tone = "brand", className }) {
  const ref = useRef(null);
  const shown = useInViewOnce(ref);
  const color = { brand: "bg-brand-500", green: "bg-emerald-500", red: "bg-red-500", white: "bg-surface" }[tone];
  return (
    <div ref={ref} className={cx("h-2 overflow-hidden rounded-full", tone === "white" ? "bg-white/25" : "bg-stone-100", className)}>
      <div className={cx("h-full rounded-full transition-all duration-700 ease-smooth", color)} style={{ width: `${shown ? Math.min(100, Math.max(0, value)) : 0}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 44, stroke = 5, tone = "brand", children }) {
  const ref = useRef(null);
  const shown = useInViewOnce(ref);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = shown ? Math.min(100, Math.max(0, value)) : 0;
  const label = Math.min(100, Math.max(0, value));
  const color = { brand: "stroke-brand-500", green: "stroke-emerald-500", red: "stroke-red-500" }[tone];
  return (
    <span ref={ref} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-stone-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className={cx("fill-none transition-all duration-700", color)}
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-stone-700">{children ?? `${Math.round(label)}%`}</span>
    </span>
  );
}

/** For empty lists: everything is added from the header's + button. */
export const ADD_HINT = "Use the + button at the top to add one.";

export function EmptyState({ icon: Icon, title, text, action, className }) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-500">
          <Icon className="size-6" />
        </span>
      )}
      <p className="font-bold text-stone-900">{title}</p>
      {text && <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Form controls ---------- */

/** Red star for a required field (screen readers hear "required"). */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-red-500" title="Required">
      *<span className="sr-only"> (required)</span>
    </span>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border-0 bg-stone-50 px-3.5 text-sm text-stone-800 ring-1 ring-stone-200 outline-none transition placeholder:text-stone-400 hover:ring-stone-300 focus:bg-surface focus:ring-2 focus:ring-brand-500 disabled:text-stone-500";

/** A labelled form field. `required` adds a red star after the label. */
export function Field({ label, hint, error, required, className, children }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="mb-1.5 block text-xs font-bold text-stone-600">
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-stone-400">{hint}</span>
      )}
    </label>
  );
}

const norm = (o) => (typeof o === "string" ? { value: o, label: o } : o);

/**
 * Custom dropdown: styled list, check mark on the chosen row, keyboard support
 * (arrows, Enter, Esc, type-to-jump) and a search box for long lists.
 */
export function Listbox({ value, options, onChange, label, renderTrigger, optionClass, searchable, disabled, triggerClass }) {
  const opts = options.map(norm);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const lastClick = useRef(-1000);
  const current = opts.find((o) => String(o.value) === String(value));
  const showSearch = searchable ?? opts.length > 8;
  const q = query.trim().toLowerCase();
  const shown = q ? opts.filter((o) => String(o.label).toLowerCase().includes(q)) : opts;

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 280 && r.top > below;
      const width = Math.max(r.width, 180);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ left, width, maxH: Math.min(320, (up ? r.top : below) - 16), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(Math.max(0, opts.findIndex((o) => String(o.value) === String(value))));
    const onDown = (e) => !btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const placed = !!pos;
  useEffect(() => {
    if (open && placed) (showSearch ? panelRef.current?.querySelector("input") : listRef.current)?.focus();
  }, [open, placed, showSearch]);

  useEffect(() => {
    listRef.current?.querySelector('[data-idx="' + active + '"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => {
    setOpen(false);
    btnRef.current?.focus();
  };
  const pick = (o) => {
    if (!o || o.disabled) return;
    if (String(o.value) !== String(value)) onChange(o.value);
    close();
  };
  const step = (dir) => {
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + dir + shown.length) % shown.length;
      if (!shown[i].disabled) return setActive(i);
    }
  };
  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape") {
      // Don't let Escape also close a surrounding modal.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
    } else if (e.key === "Tab") setOpen(false);
    else if (!showSearch && e.key.length === 1) {
      const i = shown.findIndex((o) => !o.disabled && String(o.label).toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // A wrapping <label> re-sends the click to its control; ignore that echo.
          const now = e.timeStamp;
          if (now - lastClick.current < 50) return;
          lastClick.current = now;
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cx("min-w-0 rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed", triggerClass)}
      >
        {renderTrigger({ open, current })}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={onKey}
            className="fixed z-[1000] flex max-w-[min(360px,calc(100vw-16px))] animate-pop flex-col overflow-hidden rounded-2xl bg-surface text-stone-800 shadow-float ring-1 ring-stone-900/5"
          >
            {showSearch && (
              <div className="relative border-b border-stone-100 p-1.5">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-stone-400" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Search…"
                  className="h-8 w-full rounded-xl bg-stone-50 pr-2 pl-8 text-xs outline-none placeholder:text-stone-400 focus:bg-surface focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
            <ul ref={listRef} role="listbox" tabIndex={-1} aria-label={label} style={{ maxHeight: pos.maxH }} className="overflow-y-auto p-1.5 outline-none scrollbar-thin">
              {shown.length === 0 && <li className="px-3 py-2 text-xs text-stone-400">No matches</li>}
              {shown.map((o, i) => {
                const selected = String(o.value) === String(value);
                return (
                  <li
                    key={o.value}
                    data-idx={i}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onClick={() => pick(o)}
                    className={cx(
                      "flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors",
                      i === active && !o.disabled && "bg-stone-100",
                      selected && "font-semibold text-brand-700",
                      o.disabled && "cursor-default text-stone-300",
                      o.value === "" && !selected && "text-stone-400",
                    )}
                  >
                    {optionClass ? (
                      <span className="min-w-0 flex-1">
                        <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold", optionClass(o.value))}>{o.label}</span>
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    )}
                    <Check className={cx("size-4 shrink-0 text-brand-600", !selected && "invisible")} strokeWidth={2.75} />
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Form dropdown. onChange gets an event-like { target: { value } } so it drops in for a native select. */
export function Select({ options, className, value, onChange, disabled, ...props }) {
  return (
    <Listbox
      label={props["aria-label"]}
      value={value}
      options={options}
      disabled={disabled}
      onChange={(v) => onChange?.({ target: { value: v } })}
      triggerClass="block w-full !rounded-xl"
      renderTrigger={({ open, current }) => (
        <span className={cx(inputClass, "flex items-center gap-2 pr-3", open && "bg-surface ring-2 !ring-brand-500", className)}>
          <span className={cx("min-w-0 flex-1 truncate", (!current || current.value === "") && "text-stone-400")}>{current?.label ?? "Select…"}</span>
          <ChevronDown className={cx("size-4 shrink-0 text-stone-400 transition", open && "rotate-180 text-brand-500")} strokeWidth={2.5} />
        </span>
      )}
    />
  );
}

/* ---------- Overlays ---------- */

export function Modal({ title, subtitle, icon: Icon, onClose, children, footer, size = "md", as: Tag = "div", ...rest }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    (panel?.querySelector("[data-autofocus]") ?? panel?.querySelector("input:not([disabled]),select,textarea"))?.focus();
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const width = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-2xl" }[size];
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <Tag
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("flex max-h-[92vh] w-full animate-pop flex-col rounded-t-3xl bg-surface shadow-float sm:rounded-3xl", width)}
        {...rest}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4">
          {Icon && (
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold tracking-tight text-stone-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-xs text-stone-500">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} aria-label="Close" />
        </div>
        <div className="overflow-y-auto px-6 pb-5 scrollbar-thin">{children}</div>
        {footer && <div className="flex justify-end gap-2 rounded-b-3xl border-t border-stone-100 bg-stone-50/60 px-6 py-4">{footer}</div>}
      </Tag>
    </div>
  );
}

/** Small dropdown anchored to its trigger. `children` receives a close() fn. */
export function Popover({ trigger, children, align = "right", side = "bottom", className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const panelRef = useRef(null);
  // Rendered in a portal with fixed positioning so parent overflow/stacking can't hide it.
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setPos({
        ...(side === "top" ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }),
        ...(align === "right" ? { right: window.innerWidth - r.right } : { left: r.left }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, side, align]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && !panelRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={pos}
            // Portal clicks still bubble through React parents (e.g. clickable rows); keep them here.
            onClick={(e) => e.stopPropagation()}
            className={cx("fixed z-[1000] animate-pop rounded-2xl bg-surface p-1.5 text-stone-800 shadow-float ring-1 ring-stone-900/5", className)}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}
