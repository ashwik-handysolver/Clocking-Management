import { useState } from "react";
import { Briefcase } from "lucide-react";
import { workingMembers } from "../../store/model";
import { useStore } from "../../store/store";
import { Avatar, Card, IconChip, cx } from "../ui";

/*
 * Workload (admin dashboard): estimated hours each team member has on open subtasks —
 * To do, In progress and In review (Blocked and Completed don't count).
 * A subtask shared by several people splits its estimate between them.
 * Colours: In progress (orange), In review (blue), To do (teal) — validated for colour-blind
 * separation in light and dark (index.css --color-chart-*). Each bar has a legend, values on hover.
 */

const SERIES = [
  { status: "In progress", swatch: "bg-chart-billable" },
  { status: "In review", swatch: "bg-chart-non" },
  { status: "To do", swatch: "bg-chart-todo" },
];
const OPEN = new Set(SERIES.map((s) => s.status));
const hrs = (h) => (h >= 10 || Number.isInteger(h) ? Math.round(h) : Math.round(h * 10) / 10) + "h";

export default function WorkloadCard() {
  const { items, state, teamEntries } = useStore();
  const [hover, setHover] = useState(null);
  const team = workingMembers(state.members, items, teamEntries);

  const rows = team
    .map((m) => {
      const by = { "In progress": 0, "In review": 0, "To do": 0 };
      let count = 0;
      let unestimated = 0;
      for (const s of items) {
        if (s.type !== "subtask" || !OPEN.has(s.status) || !(s.assignees ?? []).includes(m.id)) continue;
        count++;
        if (!s.estimate) unestimated++;
        else by[s.status] += Number(s.estimate) / s.assignees.length;
      }
      return { m, by, count, unestimated, total: by["In progress"] + by["In review"] + by["To do"] };
    })
    .sort((a, b) => b.total - a.total || b.count - a.count);

  const max = Math.max(...rows.map((r) => r.total), 1);
  const teamBy = Object.fromEntries(SERIES.map(({ status }) => [status, rows.reduce((t, r) => t + r.by[status], 0)]));
  const teamTotal = SERIES.reduce((t, { status }) => t + teamBy[status], 0);
  const avg = rows.length ? teamTotal / rows.length : 0;

  return (
    <Card className="bg-gradient-to-br from-teal-50/70 via-surface to-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-stone-900">
          <IconChip icon={Briefcase} tone="emerald" size="sm" />
          Workload
        </h2>
        <span className="text-xs font-semibold text-stone-500">
          <span className="text-base font-black text-stone-900 tabular-nums">{hrs(teamTotal)}</span> estimated across the team
        </span>
      </div>

      {/* Legend with team totals */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-500">
        {SERIES.map(({ status, swatch }) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={cx("size-2.5 rounded-sm", swatch)} />
            {status}
            <span className="font-bold text-stone-800 tabular-nums">{hrs(teamBy[status])}</span>
          </span>
        ))}
      </div>

      {!rows.length ? (
        <p className="py-6 text-center text-sm text-stone-400">No team members yet</p>
      ) : (
        <ul className="relative space-y-3.5" onMouseLeave={() => setHover(null)}>
          {rows.map((r) => {
            const busiest = r === rows[0] && r.total > avg * 1.5 && rows.length > 1;
            return (
              <li key={r.m.id} className="relative" onMouseEnter={() => setHover(r.m.id)}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar member={r.m} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-stone-800">{r.m.name}</span>
                  {busiest && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Busiest</span>}
                  <span className="shrink-0 text-xs text-stone-400">
                    {r.count} {r.count === 1 ? "subtask" : "subtasks"}
                    {r.unestimated > 0 && ` · ${r.unestimated} no estimate`}
                  </span>
                  <span className="w-12 shrink-0 text-right text-sm font-black text-stone-900 tabular-nums">{hrs(r.total)}</span>
                </div>
                <div
                  className="relative flex h-2.5 gap-[2px] rounded-full bg-stone-100"
                  aria-label={`${r.m.name}: ${SERIES.map(({ status }) => `${hrs(r.by[status])} ${status.toLowerCase()}`).join(", ")}`}
                >
                  {/* The coloured part grows in from the left */}
                  <div className="flex h-full w-full origin-left animate-grow-x gap-[2px]">
                    {(() => {
                      // Round only the outer ends of whichever segments are present.
                      const present = SERIES.filter(({ status }) => r.by[status] > 0);
                      return present.map(({ status, swatch }, i) => (
                        <div
                          key={status}
                          className={cx("h-full", swatch, i === 0 && "rounded-l-full", i === present.length - 1 && "rounded-r-full")}
                          style={{ width: `${(r.by[status] / max) * 100}%` }}
                        />
                      ));
                    })()}
                  </div>
                </div>
                {hover === r.m.id && r.total > 0 && (
                  <span className="palette-fixed pointer-events-none absolute -top-2 right-0 z-20 -translate-y-full rounded-xl bg-stone-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow-float">
                    <span className="mb-1 block font-bold">{r.m.name}</span>
                    {SERIES.map(({ status, swatch }) => (
                      <span key={status} className="flex items-center gap-2">
                        <span className={cx("size-2 rounded-sm", swatch)} />
                        <span className="flex-1 text-white/75">{status}</span>
                        <span className="font-bold tabular-nums">{hrs(r.by[status])}</span>
                      </span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
