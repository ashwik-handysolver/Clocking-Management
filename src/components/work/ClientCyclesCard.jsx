import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { openItem } from "../../lib/router";
import { formatDate, formatHours, todayKey } from "../../lib/time";
import { cycleHistory } from "../../store/clientHours";
import { ancestry } from "../../store/model";
import { useStore } from "../../store/store";
import { Card, IconChip, Select, cx } from "../ui";

/*
 * Billing cycles (admin dashboard, full width): billable hours clocked in each of one client's
 * billing cycles, as bars against the client's hours (dashed target line). Pick the client above
 * the chart. One series in the brand hue; over-target bars switch to red and say "over".
 */

const PLOT_H = 220; // px
const PILLS_MAX = 6; // more clients than this: a dropdown instead of buttons

/** "Oct 2026" for one-month cycles, otherwise "1 Oct – 31 Dec". */
function cycleLabel(c, months) {
  if (months === 1 && c.start.endsWith("-01")) return formatDate(c.start, { month: "short", year: "numeric" });
  return `${formatDate(c.start)} – ${formatDate(c.end)}`;
}

/** A round number just above `max`, so the axis reads 0 / 50 / 100 / 150… */
function niceMax(max) {
  const step = max <= 20 ? 5 : max <= 60 ? 10 : max <= 200 ? 25 : max <= 500 ? 50 : 100;
  return Math.max(step, Math.ceil((max * 1.12) / step) * step); // headroom for the labels on the tallest bar
}

export default function ClientCyclesCard({ entries, now }) {
  const { allIndex: index, state, me } = useStore();
  const today = todayKey();
  // Team members: only clients they're assigned work in (the admin sees every client).
  const myClientIds = useMemo(() => {
    if (me.isAdmin) return null;
    const ids = new Set();
    for (const s of state.items)
      if (s.type === "subtask" && (s.assignees ?? []).includes(me.id)) {
        const c = ancestry(index, s.id).find((x) => x.type === "client");
        if (c) ids.add(c.id);
      }
    return ids;
  }, [me, state.items, index]);
  const clients = state.items
    .filter((i) => i.type === "client" && !i.archived && i.budgetHours && (!myClientIds || myClientIds.has(i.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [pickedId, setPickedId] = useState(null);
  const client = clients.find((c) => c.id === pickedId) ?? clients[0];
  const [hover, setHover] = useState(null);

  const cycles = useMemo(() => {
    if (!client) return [];
    const mine = entries.filter((e) => ancestry(index, e.subtaskId).some((x) => x.id === client.id));
    return cycleHistory({ client, entries: mine, index, now, today });
  }, [client, entries, index, now, today]);

  if (!clients.length) return null; // no client has hours set

  const target = client.budgetHours * 3600;
  const top = niceMax(Math.max(target, ...cycles.map((c) => c.seconds)) / 3600) * 3600;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const pct = (secs) => (secs / top) * 100;
  const finished = cycles.filter((c) => !c.current && !c.upcoming);
  const avg = finished.length ? finished.reduce((s, c) => s + c.seconds, 0) / finished.length : null;
  const overCount = finished.filter((c) => c.seconds > target).length;
  const months = client.cycleMonths || 1;

  return (
    <Card className="bg-gradient-to-br from-brand-50/60 via-surface to-surface p-5">
      {/* Title, client picker, summary */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-stone-900">
          <IconChip icon={BarChart3} tone="brand" size="sm" />
          Billing cycles
        </h2>
        {clients.length > PILLS_MAX ? (
          <Select
            value={client.id}
            onChange={(e) => setPickedId(e.target.value)}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            className="!h-9 w-56"
          />
        ) : (
          <div role="group" aria-label="Client" className="flex flex-wrap gap-1 rounded-full bg-stone-100 p-0.5">
            {clients.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === client.id}
                onClick={() => setPickedId(c.id)}
                className={cx(
                  "rounded-full px-3 py-1 text-xs font-bold transition",
                  c.id === client.id ? "bg-surface text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <dl className="ml-auto flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <div>
            <dt className="font-semibold text-stone-400">Client hours</dt>
            <dd className="font-extrabold text-stone-900">
              {client.budgetHours}h <span className="font-semibold text-stone-400">/ {months === 1 ? "month" : `${months} months`}</span>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-stone-400">Average per cycle</dt>
            <dd className="font-extrabold text-stone-900">{avg == null ? "—" : formatHours(avg)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-stone-400">Cycles over</dt>
            <dd className={cx("font-extrabold", overCount ? "text-red-600" : "text-stone-900")}>
              {finished.length ? `${overCount} of ${finished.length}` : "—"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Chart: y-axis, recessive grid, dashed target line, one bar per cycle with its hours on top.
          pt-8 keeps the top labels clear of the header. */}
      <div className="flex gap-2 pt-8">
        <div className="relative w-9 shrink-0 text-right text-[11px] font-semibold text-stone-400" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ bottom: `${pct(t)}%` }}>
              {Math.round(t / 3600)}h
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto pb-1 scrollbar-thin">
          <div style={{ minWidth: cycles.length * 64 }}>
            <div className="relative" style={{ height: PLOT_H }} onMouseLeave={() => setHover(null)}>
              {ticks.map((t) => (
                <div key={t} aria-hidden="true" className={cx("absolute inset-x-0 border-t", t ? "border-dashed border-stone-200/80" : "border-stone-300")} style={{ bottom: `${pct(t)}%` }} />
              ))}
              {/* Target */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-stone-500" style={{ bottom: `${pct(target)}%` }}>
                <span className="absolute -top-5 right-0 rounded-md bg-surface/90 px-1.5 text-[11px] font-bold text-stone-600">Target {client.budgetHours}h</span>
              </div>
              <div className="absolute inset-0 flex items-end gap-3 px-1 sm:gap-5">
                {cycles.map((c, i) => {
                  const over = c.seconds > target;
                  return (
                    <div
                      key={`${client.id}-${c.start}`} // a new client's bars grow in again
                      tabIndex={0}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      aria-label={`${cycleLabel(c, months)}: ${formatHours(c.seconds)} of ${client.budgetHours}h${c.current ? ", in progress" : ""}`}
                      className="relative h-full flex-1 outline-none"
                    >
                      <div
                        className={cx(
                          "absolute inset-x-0 bottom-0 mx-auto w-full max-w-14 origin-bottom animate-grow-y rounded-t-[4px] transition-[filter]",
                          over ? "bg-red-500" : c.current ? "bg-brand-300" : "bg-brand-500",
                          hover === i && "brightness-110",
                        )}
                        style={{ height: c.seconds ? `${Math.max(1.5, pct(c.seconds))}%` : "2px", animationDelay: `${i * 60}ms` }}
                      />
                      {/* Hours just above the bar (the plot keeps headroom for it); appear once the bar has grown */}
                      <span
                        className={cx("absolute inset-x-0 animate-fade-in text-center text-xs font-extrabold tabular-nums", over ? "text-red-600" : "text-stone-800")}
                        style={{ bottom: `calc(${pct(c.seconds)}% + 4px)`, animationDelay: `${300 + i * 60}ms` }}
                      >
                        {formatHours(c.seconds)}
                      </span>
                      {/* Hover details: beside the bar (flips left near the right edge), inside the chart */}
                      {hover === i && (
                        <div
                          className={cx(
                            "palette-fixed pointer-events-none absolute top-1/2 z-20 w-max max-w-56 -translate-y-1/2 rounded-xl bg-stone-900 px-3 py-2 text-xs text-white shadow-float",
                            i >= cycles.length / 2 && cycles.length > 1 ? "right-[calc(50%+32px)]" : "left-[calc(50%+32px)]",
                          )}
                        >
                          <p className="font-bold">
                            {formatDate(c.start, { day: "numeric", month: "short", year: "numeric" })} – {formatDate(c.end, { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          <p className="mt-0.5">
                            <b>{formatHours(c.seconds)}</b> of {client.budgetHours}h · {Math.round((c.seconds / target) * 100)}%
                            {over && <span className="ml-1 font-bold text-red-300">over</span>}
                          </p>
                          {c.nonBillable > 0 && <p className="text-white/60">+ {formatHours(c.nonBillable)} non-billable</p>}
                          {c.current && <p className="text-white/60">In progress</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Cycle labels */}
            <div className="mt-2 flex gap-3 px-1 sm:gap-5">
              {cycles.map((c) => (
                <span key={c.start} className={cx("flex-1 text-center text-[11px] leading-tight font-bold", c.current ? "text-brand-600" : "text-stone-400")}>
                  {cycleLabel(c, months)}
                  {c.current && <span className="block font-semibold">now</span>}
                  {c.upcoming && <span className="block font-semibold">starts soon</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3 text-xs text-stone-500">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-brand-500" /> Billable hours clocked</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-brand-300" /> Current cycle (so far)</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-red-500" /> Over client hours</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-stone-500" /> Client hours</span>
        <button type="button" onClick={() => openItem(client.id)} className="ml-auto font-bold text-brand-700 hover:underline">
          Open {client.name}
        </button>
      </div>
    </Card>
  );
}
