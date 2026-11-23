import { IconChip, cx } from "../ui";
import { CountUp } from "../motion";

/*
 * Shared dashboard pieces: the bold header banner and the colourful stat tiles.
 */

const greeting = (d = new Date()) => (d.getHours() < 12 ? "Good Morning" : d.getHours() < 17 ? "Good Afternoon" : "Good Evening");

/**
 * Dark banner across the top of a dashboard. `children` go on the right (stats, buttons).
 * Optional: `greeting={null}` shows just the name (e.g. someone's profile), `lead` sits before the text
 * (e.g. their picture) and `details` is a line under the title.
 */
export function Hero({ name, title, children, greeting: greet = true, lead, details }) {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="palette-fixed relative overflow-hidden rounded-3xl bg-stone-900 px-6 py-6 text-white @3xl:px-8 @3xl:py-7">
      {/* glows */}
      <div className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-[radial-gradient(closest-side,rgb(249_115_22/0.55),transparent)]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 size-96 rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.35),transparent)]" />
      {/* faint dot grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        {/* Phones: the picture (if any) sits above the name */}
        <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
          {lead}
          <div className="min-w-0">
            {greet && <p className="text-xs font-bold tracking-[0.18em] text-brand-300 uppercase">{today}</p>}
            <h1 className={cx("text-2xl font-black tracking-tight @3xl:text-3xl", greet && "mt-1.5")}>{greet ? `${greeting()}, ${name}` : name}</h1>
            {title && <div className="mt-1 text-sm font-medium text-white/70">{title}</div>}
            {details && <div className="mt-2 text-xs font-medium text-white/70">{details}</div>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
      </div>
    </section>
  );
}

/**
 * Dashboard page title: date and greeting on one line of the page itself, no banner.
 * `children` sit on the right (e.g. a couple of <InlineStat>s).
 */
export function Greeting({ name, children }) {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-500">{today}</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">
          {greeting()}, {name}
        </h1>
      </div>
      {children && <div className="flex flex-wrap items-stretch gap-x-5 gap-y-2">{children}</div>}
    </header>
  );
}

/** A small number beside the greeting: label above, value below, thin divider on the left. */
export function InlineStat({ label, value, live, icon: Icon, iconClass }) {
  return (
    <div className="border-l border-stone-200 pl-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
        {live && <span className="size-1.5 animate-pulse-dot rounded-full bg-emerald-500" />}
        {label}
      </p>
      <p className="flex items-center gap-1.5 text-lg font-extrabold text-stone-900 tabular-nums">
        {Icon && <Icon className={cx("size-4 shrink-0", iconClass)} aria-hidden />}
        {value}
      </p>
    </div>
  );
}

/** A number inside the hero: no box, just a thin divider on its left. */
export function HeroStat({ label, value, live, sub, icon: Icon, iconClass }) {
  return (
    <div className="hero-stat h-full min-w-0 border-l border-white/15 px-4 py-1">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-white/65 uppercase">
        {live && <span className="size-2 animate-pulse-dot rounded-full bg-emerald-400" />}
        {label}
      </p>
      <p className="flex items-center gap-1.5 text-xl font-extrabold tabular-nums">
        {Icon && <Icon className={cx("size-5 shrink-0", iconClass)} aria-hidden />}
        <CountUp text={value} />
      </p>
      {sub && <p className="text-[11px] leading-tight font-semibold text-white/75">{sub}</p>}
    </div>
  );
}

/**
 * A key number. On its own it's a bordered tile; inside <StatStrip> it's a plain cell, so a row of
 * numbers is one box with dividers instead of a box per number.
 */
export function StatTile({ icon, label, value, sub, bare }) {
  return (
    <div className={cx("relative min-w-0 bg-surface p-4", !bare && "rounded-2xl ring-1 ring-stone-200")}>
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-bold tracking-wide text-stone-600 uppercase">{label}</p>
        <IconChip icon={icon} size="sm" />
      </div>
      <p className="relative mt-2 text-3xl font-black tracking-tight text-stone-900 tabular-nums">
        <CountUp text={value} />
      </p>
      {sub && <div className="relative mt-0.5 truncate text-xs font-medium text-stone-600">{sub}</div>}
    </div>
  );
}

/** A row of numbers in one bordered box; hairline gaps between cells (wraps cleanly on small screens). */
export function StatStrip({ className, children }) {
  return <div className={cx("grid overflow-hidden rounded-2xl bg-surface ring-1 ring-stone-200", className)}>{children}</div>;
}
