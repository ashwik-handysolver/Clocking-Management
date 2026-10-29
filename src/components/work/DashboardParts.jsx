import { IconChip, Watermark, cx } from "../ui";
import { CountUp } from "../motion";

/*
 * Shared dashboard pieces: the bold header banner and the colourful stat tiles.
 */

const greeting = (d = new Date()) => (d.getHours() < 12 ? "Good morning" : d.getHours() < 17 ? "Good afternoon" : "Good evening");

/** Dark banner across the top of a dashboard. `children` go on the right (stats, buttons). */
export function Hero({ name, title, children }) {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="palette-fixed relative overflow-hidden rounded-3xl bg-stone-900 px-6 py-6 text-white shadow-float @3xl:px-8 @3xl:py-7">
      {/* glows */}
      <div className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-[radial-gradient(closest-side,rgb(249_115_22/0.55),transparent)]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 size-96 rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.35),transparent)]" />
      {/* faint dot grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-brand-300 uppercase">{today}</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight @3xl:text-3xl">
            {greeting()}, {name}
          </h1>
          {title && <p className="mt-1 text-sm font-medium text-white/70">{title}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
      </div>
    </section>
  );
}

/** A glassy number inside the hero. */
export function HeroStat({ label, value, live, sub }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15 backdrop-blur">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-white/65 uppercase">
        {live && <span className="size-2 animate-pulse-dot rounded-full bg-emerald-400" />}
        {label}
      </p>
      <p className="text-xl font-extrabold tabular-nums">
        <CountUp text={value} />
      </p>
      {sub && <p className="text-[11px] font-semibold text-white/75">{sub}</p>}
    </div>
  );
}

const TILE_BG = {
  brand: "from-brand-100 via-brand-50 to-surface ring-brand-200/70",
  emerald: "from-emerald-100 via-emerald-50 to-surface ring-emerald-200/70",
  violet: "from-violet-100 via-violet-50 to-surface ring-violet-200/70",
  sky: "from-sky-100 via-sky-50 to-surface ring-sky-200/70",
  amber: "from-amber-100 via-amber-50 to-surface ring-amber-200/70",
  stone: "from-stone-100 via-stone-50 to-surface ring-stone-200/70",
};

/** Colourful number tile with a big faded icon in the corner. */
export function StatTile({ icon, tone = "brand", label, value, sub }) {
  return (
    <div className={cx("relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 shadow-soft ring-1 transition hover:-translate-y-0.5 hover:shadow-float", TILE_BG[tone] ?? TILE_BG.brand)}>
      <Watermark icon={icon} tone={tone} className="!-right-4 !-bottom-5 !size-28" />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-bold tracking-wide text-stone-600 uppercase">{label}</p>
        <IconChip icon={icon} tone={tone} size="sm" />
      </div>
      <p className="relative mt-2 text-3xl font-black tracking-tight text-stone-900 tabular-nums">
        <CountUp text={value} />
      </p>
      {sub && <div className="relative mt-0.5 truncate text-xs font-medium text-stone-600">{sub}</div>}
    </div>
  );
}
