import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Camera, Clock, ListChecks, PencilLine, Timer } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { navigate, openItem } from "../../lib/router";
import { DAY, addDays, formatDate, formatHours, formatTime, startOfDay, startOfWeek } from "../../lib/time";
import { ancestry, assigneesOf, entrySeconds, isDone, pathLabel } from "../../store/model";
import { creatorOf, isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import AdminDashboard from "./AdminDashboard";
import { Hero, HeroStat, StatTile } from "./DashboardParts";
import { Button, Card, EmptyState, IconChip, StatusIcon, cx } from "../ui";

/*
 * Personal dashboard: only the signed-in user's own time (store/permissions.js).
 * Every chart is a single series in the brand hue, so no categorical palette is needed.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"]; // working days only
const RECENT = 5; // sessions shown at first, and added per "Load more"

/** Seconds of `entries` that fall inside [from, to), clipping entries that cross the edges. */
function secondsBetween(entries, from, to, now) {
  let total = 0;
  for (const e of entries) {
    const start = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to);
    if (end > start) total += (end - start) / 1000;
  }
  return total;
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full bg-stone-100 p-0.5">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cx(
            "rounded-full px-3 py-1 text-xs font-bold transition",
            value === key ? "bg-surface text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ icon, title, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-stone-900">
        <IconChip icon={icon} tone="brand" size="sm" />
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Hours per day for one week, as bars. Hovering a bar shows its exact value. */
function WeekChart({ entries, now }) {
  const [which, setWhich] = useState("this");
  const weekStart = which === "this" ? startOfWeek(now) : addDays(startOfWeek(now), -7);
  const todayIdx = which === "this" ? Math.round((startOfDay(now) - weekStart) / DAY) : -1;
  const days = DAY_NAMES.map((_, i) => secondsBetween(entries, addDays(weekStart, i), addDays(weekStart, i + 1), now));
  const max = Math.max(...days, 4 * 3600); // keep short days from looking full
  const total = days.reduce((a, b) => a + b, 0);
  const [hover, setHover] = useState(null);

  return (
    <Card className="bg-gradient-to-br from-brand-50/70 via-surface to-surface p-5">
      <SectionTitle icon={Clock} title="Hours by day">
        <Segmented label="Week" value={which} onChange={setWhich} options={[["this", "This week"], ["last", "Last week"]]} />
      </SectionTitle>
      <p className="mb-4 text-sm text-stone-500">
        <span className="text-2xl font-extrabold text-stone-900">{formatHours(total)}</span> from {formatDate(weekStart)} to {formatDate(addDays(weekStart, 4))}
      </p>
      <div className="relative">
        {/* Recessive grid: a line at the max and at half */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 border-t border-dashed border-stone-200" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-20 border-t border-dashed border-stone-100" />
        <div className="flex h-40 items-end gap-2 sm:gap-4" onMouseLeave={() => setHover(null)}>
          {days.map((secs, i) => (
            <div
              key={i}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${DAY_NAMES[i]}: ${formatHours(secs)}`}
            >
              {hover === i && (
                <span className="absolute -top-8 z-10 palette-fixed rounded-lg bg-stone-900 px-2 py-1 text-xs font-bold whitespace-nowrap text-white shadow-float">
                  {DAY_NAMES[i]} · {formatHours(secs)}
                </span>
              )}
              <div
                className={cx(
                  "w-full max-w-10 rounded-t-[4px] transition-all",
                  i === todayIdx ? "bg-brand-500" : hover === i ? "bg-brand-400" : "bg-brand-300",
                  secs === 0 && "!bg-stone-200",
                )}
                style={{ height: secs ? `${Math.max(4, (secs / max) * 100)}%` : "2px" }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2 border-t border-stone-200 pt-2 sm:gap-4">
          {DAY_NAMES.map((d, i) => (
            <span key={d} className={cx("flex-1 text-center text-[11px] font-bold", i === todayIdx ? "text-brand-600" : "text-stone-400")}>
              {d}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Time split by client, then project, for a date range. */
function TimeByClient({ entries, now }) {
  const { index } = useStore();
  const [range, setRange] = useState("week");
  const from = range === "week" ? startOfWeek(now) : new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();

  const clients = useMemo(() => {
    const byClient = new Map();
    for (const e of entries) {
      const secs = secondsBetween([e], from, now + 1, now);
      if (!secs) continue;
      const chain = ancestry(index, e.subtaskId);
      const client = chain.find((x) => x.type === "client");
      const project = chain.find((x) => x.type === "project");
      if (!client) continue;
      const c = byClient.get(client.id) ?? { item: client, secs: 0, projects: new Map() };
      c.secs += secs;
      if (project) {
        const p = c.projects.get(project.id) ?? { item: project, secs: 0 };
        p.secs += secs;
        c.projects.set(project.id, p);
      }
      byClient.set(client.id, c);
    }
    return [...byClient.values()]
      .map((c) => ({ ...c, projects: [...c.projects.values()].sort((a, b) => b.secs - a.secs) }))
      .sort((a, b) => b.secs - a.secs);
  }, [entries, index, from, now]);

  const total = clients.reduce((s, c) => s + c.secs, 0);
  const max = clients[0]?.secs ?? 1;

  return (
    <Card className="bg-gradient-to-br from-brand-50/70 via-surface to-surface p-5">
      <SectionTitle icon={Timer} title="Where your time went">
        <Segmented label="Range" value={range} onChange={setRange} options={[["week", "This week"], ["month", "This month"]]} />
      </SectionTitle>
      {!clients.length ? (
        <p className="py-8 text-center text-sm text-stone-400">No time logged {range === "week" ? "this week" : "this month"} yet.</p>
      ) : (
        <ul className="space-y-4">
          {clients.map((c) => (
            <li key={c.item.id}>
              <button type="button" onClick={() => openItem(c.item.id)} className="group mb-1.5 flex w-full items-baseline justify-between gap-2 text-left">
                <span className="truncate text-sm font-bold text-stone-800 group-hover:text-brand-700">{c.item.name}</span>
                <span className="shrink-0 text-sm font-bold text-stone-900 tabular-nums">
                  {formatHours(c.secs)} <span className="font-medium text-stone-400">· {Math.round((c.secs / total) * 100)}%</span>
                </span>
              </button>
              <div className="h-2.5 rounded-full bg-stone-100" title={`${c.item.name}: ${formatHours(c.secs)}`}>
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c.secs / max) * 100}%` }} />
              </div>
              {c.projects.length > 1 && (
                <ul className="mt-2 space-y-1.5 pl-3">
                  {c.projects.map((p) => (
                    <li key={p.item.id} className="flex items-center gap-3 text-xs">
                      <button type="button" onClick={() => openItem(p.item.id)} className="w-32 shrink-0 truncate text-left text-stone-500 hover:text-brand-700">
                        {p.item.name}
                      </button>
                      <div className="h-1.5 flex-1 rounded-full bg-stone-100" title={`${p.item.name}: ${formatHours(p.secs)}`}>
                        <div className="h-full rounded-full bg-brand-300" style={{ width: `${(p.secs / max) * 100}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right font-semibold text-stone-600 tabular-nums">{formatHours(p.secs)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const RECENT_SUBTASKS = 7;

/** The newest subtasks assigned to you, with a link to the full list on My work. */
function RecentSubtasks() {
  const { items, index, me, memberById } = useStore();
  const recent = items
    .filter((s) => s.type === "subtask" && assigneesOf(s).includes(me.id))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, RECENT_SUBTASKS);

  return (
    <Card className="flex flex-col bg-gradient-to-br from-brand-50/70 via-surface to-surface p-5">
      <SectionTitle icon={ListChecks} title="Recent subtasks">
        <Button variant="ghost" size="sm" onClick={() => navigate("my")}>
          View all <ArrowRight className="size-3.5" />
        </Button>
      </SectionTitle>
      {!recent.length ? (
        <p className="py-8 text-center text-sm text-stone-400">No subtasks assigned to you yet.</p>
      ) : (
        <ul className="-mx-2 flex-1 space-y-0.5">
          {recent.map((s) => {
            const by = memberById.get(creatorOf(s));
            return (
              <li key={s.id}>
                <button type="button" onClick={() => openItem(s.id)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-brand-50/70">
                  <StatusIcon status={s.status} className="size-[18px] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-sm font-bold text-stone-800 group-hover:text-brand-700", isDone(s) && "!text-stone-400 line-through")}>{s.name}</span>
                    <span className="block truncate text-xs text-stone-400">{pathLabel(index, s.id).replaceAll(" / ", " › ")}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] leading-tight text-stone-400">
                    {s.createdAt ? formatDate(s.createdAt) : ""}
                    {by && <span className="block font-semibold text-stone-500">{by.id === me.id ? "by you" : `by ${by.name.split(" ")[0]}`}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Your latest time entries. */
function RecentSessions({ entries, now }) {
  const { index } = useStore();
  const [shown, setShown] = useState(RECENT);
  const sorted = [...entries].sort((a, b) => b.start - a.start);
  const recent = sorted.slice(0, shown);
  const remaining = sorted.length - recent.length;

  return (
    <Card className="bg-gradient-to-br from-brand-50/70 via-surface to-surface p-5">
      <SectionTitle icon={Camera} title="Recent sessions" />
      {!recent.length ? (
        <EmptyState icon={Clock} title="No sessions yet" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold tracking-wide text-stone-400 uppercase">
                <th className="w-40 px-2 pb-2">When</th>
                <th className="px-2 pb-2">Subtask</th>
                <th className="w-20 px-2 pb-2 text-right">Duration</th>
                <th className="w-24 px-2 pb-2 text-right">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {recent.map((e) => {
                const sub = index.get(e.subtaskId);
                const live = e.end == null;
                return (
                  <tr key={e.id} className="cursor-pointer hover:bg-stone-50" onClick={() => sub && openItem(sub.id)}>
                    <td className="px-2 py-2.5 whitespace-nowrap text-stone-600">
                      {formatDate(e.start)} · {formatTime(e.start)}–{live ? "now" : formatTime(e.end)}
                    </td>
                    <td className="max-w-0 px-2 py-2.5">
                      <span className="block truncate font-semibold text-stone-800">{sub?.name ?? "Deleted subtask"}</span>
                      <span className="block truncate text-xs text-stone-400">{sub ? pathLabel(index, sub.id).replaceAll(" / ", " › ") : ""}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {live && <span className="mr-1.5 inline-block size-2 animate-pulse-dot rounded-full bg-emerald-500" />}
                      <span className="font-bold text-stone-900">{formatHours(entrySeconds(e, now))}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {e.source === "manual" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-stone-400">
                          <PencilLine className="size-3.5" /> Manual
                        </span>
                      ) : e.screenCapture ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600">
                          <Camera className="size-3.5 text-brand-500" /> Recorded
                        </span>
                      ) : (
                        <span className="text-xs text-stone-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(remaining > 0 || shown > RECENT) && (
            <div className="mt-3 flex justify-center gap-2 px-2">
              {remaining > 0 && (
                <Button variant="soft" size="sm" onClick={() => setShown((n) => n + RECENT)}>
                  Load more ({remaining} left)
                </Button>
              )}
              {shown > RECENT && (
                <Button variant="ghost" size="sm" onClick={() => setShown(RECENT)}>
                  Show less
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** The admin gets the team overview; everyone else sees their own time. */
export default function Dashboard() {
  const { me } = useStore();
  return isAdmin(me) ? <AdminDashboard /> : <PersonalDashboard />;
}

function PersonalDashboard() {
  const { entries, me } = useStore(); // your own time only
  const running = entries.some((e) => e.end == null);
  const now = useNow(running, 30_000);

  const weekStart = startOfWeek(now);
  const thisWeek = secondsBetween(entries, weekStart, now + 1, now);
  // Last week up to the same point in the week, so the comparison is fair mid-week.
  const lastWeekSoFar = secondsBetween(entries, addDays(weekStart, -7), now - 7 * DAY, now);
  const today = secondsBetween(entries, startOfDay(now), now + 1, now);
  const sessions = entries.filter((e) => e.start >= weekStart).length;
  const delta = thisWeek - lastWeekSoFar;

  return (
    <div className="@container space-y-4">
      <Hero name={me.name.split(" ")[0]} title="Here's your week so far">
        <HeroStat label="Today" value={formatHours(today)} live={running} />
        <HeroStat label="This week" value={formatHours(thisWeek)} />
      </Hero>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={Clock}
          tone="brand"
          label="This week"
          value={formatHours(thisWeek)}
          sub={
            lastWeekSoFar || thisWeek ? (
              <span className={cx("inline-flex items-center gap-0.5 font-semibold", delta >= 0 ? "text-emerald-600" : "text-stone-500")}>
                {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {formatHours(Math.abs(delta))} {delta >= 0 ? "more" : "less"} than last week so far
              </span>
            ) : (
              "No time yet"
            )
          }
        />
        <StatTile icon={Timer} tone="emerald" label="Today" value={formatHours(today)} sub={running ? "Clocked in now" : "Not clocked in"} />
        <StatTile icon={Camera} tone="sky" label="Sessions this week" value={sessions} sub="Timer and manual entries" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <WeekChart entries={entries} now={now} />
        <RecentSubtasks />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <RecentSessions entries={entries} now={now} />
        <TimeByClient entries={entries} now={now} />
      </div>
    </div>
  );
}
