import { useState } from "react";
import { formatHours } from "../lib/time";
import { cx } from "./ui";

/*
 * Small hand-built charts (no chart library).
 * Two series everywhere: billable (chart-billable, orange) and non-billable (chart-non, blue).
 * The pair is validated for colour-blind separation in light and dark (see index.css).
 * Every chart has a legend, hover/focus tooltips with exact values, and a 2px gap between segments.
 */

export const SERIES = [
  { key: "billable", label: "Billable", swatch: "bg-chart-billable", stroke: "var(--color-chart-billable)" },
  { key: "non", label: "Non-billable", swatch: "bg-chart-non", stroke: "var(--color-chart-non)" },
];

export function Legend({ values }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-500">
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className={cx("size-2.5 rounded-sm", s.swatch)} />
          {s.label}
          {values && <span className="font-bold text-stone-800 tabular-nums">{formatHours(values[s.key])}</span>}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ title, values }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-xl bg-stone-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow-float palette-fixed">
      <span className="mb-1 block font-bold">{title}</span>
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-2">
          <span className={cx("size-2 rounded-sm", s.swatch)} />
          <span className="flex-1 text-white/75">{s.label}</span>
          <span className="font-bold tabular-nums">{formatHours(values[s.key])}</span>
        </span>
      ))}
      <span className="mt-1 flex justify-between gap-4 border-t border-white/15 pt-1 text-white/75">
        Total <span className="font-bold text-white tabular-nums">{formatHours(values.billable + values.non)}</span>
      </span>
    </span>
  );
}

/**
 * Horizontal stacked bars, one per row, scaled to the largest row.
 * `rows`: [{ key, label, lead?, billable, non, onClick? }] in seconds.
 */
export function StackedBars({ rows }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.map((r) => r.billable + r.non), 1);
  return (
    <ul className="space-y-3.5" onMouseLeave={() => setHover(null)}>
      {rows.map((r) => {
        const total = r.billable + r.non;
        const Label = r.onClick ? "button" : "span";
        return (
          <li key={r.key} className="relative" onMouseEnter={() => setHover(r.key)}>
            {hover === r.key && (
              <span className="absolute -top-1 right-0 z-20">
                <span className="relative block">
                  <Tooltip title={r.label} values={r} />
                </span>
              </span>
            )}
            <div className="mb-1.5 flex items-center gap-2">
              {r.lead}
              <Label
                {...(r.onClick && { type: "button", onClick: r.onClick })}
                className={cx("min-w-0 flex-1 truncate text-left text-sm font-bold text-stone-800", r.onClick && "hover:text-brand-700")}
              >
                {r.label}
              </Label>
              <span className="shrink-0 text-sm font-bold text-stone-900 tabular-nums">{formatHours(total)}</span>
            </div>
            <div className="flex h-2.5 gap-[2px] rounded-full bg-stone-100" aria-label={`${r.label}: ${formatHours(r.billable)} billable, ${formatHours(r.non)} non-billable`}>
              {r.billable > 0 && <div className="h-full rounded-l-full bg-chart-billable" style={{ width: `${(r.billable / max) * 100}%`, borderRadius: r.non ? undefined : 9999 }} />}
              {r.non > 0 && <div className="h-full rounded-r-full bg-chart-non" style={{ width: `${(r.non / max) * 100}%`, borderRadius: r.billable ? undefined : 9999 }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
