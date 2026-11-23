import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Camera, ChevronLeft, ChevronRight, Clock, Flame, ListChecks, PencilLine } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { navigate, openItem } from "../../lib/router";
import { addDays, formatDate, formatHours, formatTime, fromDateKey, startOfDay, startOfWeek, timeAgo, toDateKey } from "../../lib/time";
import { entrySeconds, isDone, pathLabel } from "../../store/model";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import AdminDashboard from "./AdminDashboard";
import ClientCyclesCard from "./ClientCyclesCard";
import { loadClientHoursEntries } from "../../store/db";
import { ClockButton } from "./ClockCard";
import { Hero, HeroStat } from "./DashboardParts";
import { Button, Card, EmptyState, IconChip, StatusIcon, cx, inputClass } from "../ui";
import { Segmented as SharedSegmented } from "../admin/AdminPage";
import { Fire, useReveal } from "../motion";

/*
 * Personal dashboard: only the signed-in user's own time (store/permissions.js).
 * Every chart is a single series in the brand hue, so no categorical palette is needed.
 */

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

/** The shared switch with the gliding highlight, in its smaller size. */
const Segmented = (props) => <SharedSegmented size="sm" {...props} />;

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

const MAX_CUSTOM_DAYS = 92; // a custom range is cut to about three months so the bars stay readable
const TARGET_HOURS = 8; // a full working day, drawn as the dashed target line

/**
 * Chart slots from `first` to `last` (inclusive): every Mon–Fri, plus a Saturday or Sunday only
 * when it has time on it, so weekend work shows up and counts in the total.
 */
function workingDaysBetween(first, last, short, entries, now) {
  const out = [];
  for (let day = startOfDay(first); day <= last && out.length < MAX_CUSTOM_DAYS; day = addDays(day, 1)) {
    const wd = new Date(day).getDay();
    if ((wd === 0 || wd === 6) && !secondsBetween(entries, day, addDays(day, 1), now)) continue;
    out.push({
      start: day,
      label: short ? formatDate(day, { weekday: "short" }) : String(new Date(day).getDate()),
      name: formatDate(day, { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return out;
}

/** Hours per working day for a week, a month or any dates, as bars. Hovering a bar shows its exact value. */
function WeekChart({ entries, now }) {
  const [mode, setMode] = useState("week"); // week | month | custom
  const [offset, setOffset] = useState(0); // weeks or months back from the current one
  const [from, setFrom] = useState(() => toDateKey(startOfWeek(now)));
  const [to, setTo] = useState(() => toDateKey(now));
  const [hover, setHover] = useState(null);
  const pickMode = (m) => {
    setMode(m);
    setOffset(0);
  };

  // The period on show, and what to call it.
  let first, last, title;
  if (mode === "week") {
    first = addDays(startOfWeek(now), offset * 7);
    last = addDays(first, 6); // Sat and Sun only appear when they have time
    title = offset === 0 ? "This week" : offset === -1 ? "Last week" : `${formatDate(first)} – ${formatDate(addDays(first, 4))}`;
  } else if (mode === "month") {
    const d = new Date(now);
    first = new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
    last = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0).getTime();
    title = formatDate(first, { month: "long", year: "numeric" });
  } else {
    first = fromDateKey(from);
    last = fromDateKey(to);
    title = from === to ? formatDate(first, { weekday: "long", day: "numeric", month: "short" }) : `${formatDate(first)} – ${formatDate(last)}`;
  }
  const weekdays = mode === "week" || (mode === "custom" && last - first < 7 * 24 * 3600 * 1000);
  const slots = workingDaysBetween(first, last, weekdays, entries, now);
  const todayIdx = slots.findIndex((x) => x.start === startOfDay(now));
  const days = slots.map((x) => secondsBetween(entries, x.start, addDays(x.start, 1), now));
  // Fixed scale: at least the 8h target, rounded up to an even number of hours, so the
  // same bar height means the same hours from one period to the next.
  const topHours = Math.max(TARGET_HOURS, Math.ceil(Math.max(0, ...days) / 3600 / 2) * 2);
  const max = topHours * 3600;
  const ticks = [0, topHours / 4, topHours / 2, (topHours * 3) / 4, topHours];
  const total = days.reduce((a, b) => a + b, 0);
  const gap = slots.length > 10 ? "gap-0.5 sm:gap-1" : "gap-2 sm:gap-4";
  const atNow = offset >= 0; // no stepping into the future

  const arrow = "grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:pointer-events-none disabled:opacity-30";
  return (
    <Card className="bg-gradient-to-br from-brand-50/70 via-surface to-surface p-5">
      <SectionTitle icon={Clock} title="Hours by day">
        <Segmented label="Period" value={mode} onChange={pickMode} options={[["week", "Week"], ["month", "Month"], ["custom", "Custom"]]} />
      </SectionTitle>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">
          <span className="text-2xl font-extrabold text-stone-900">{formatHours(total)}</span> {title}
        </p>
        {mode === "custom" ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
            to
            <input type="date" aria-label="To" value={to} min={from} max={toDateKey(now)} onChange={(e) => e.target.value && setTo(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <button type="button" aria-label={`Previous ${mode}`} onClick={() => setOffset((o) => o - 1)} className={arrow}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" aria-label={`Next ${mode}`} disabled={atNow} onClick={() => setOffset((o) => o + 1)} className={arrow}>
              <ChevronRight className="size-4" />
            </button>
          </span>
        )}
      </div>
      {!slots.length && <p className="py-14 text-center text-sm text-stone-400">No working days in these dates</p>}
      {slots.length > 0 && (
      <div className="flex gap-2">
        {/* y-axis: hours */}
        <div aria-hidden="true" className="relative h-40 w-7 shrink-0 text-right text-[11px] font-semibold text-stone-400 tabular-nums">
          {ticks.map((h) => (
            <span key={h} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(h / topHours) * 100}%` }}>
              {+h.toFixed(1)}h
            </span>
          ))}
        </div>
      <div className="relative min-w-0 flex-1">
        {/* Recessive grid at each tick, a solid baseline, and the dashed daily target */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40">
          {ticks.map((h) => (
            <div key={h} className={cx("absolute inset-x-0 border-t", h ? "border-transparent" : "border-stone-300")} style={{ bottom: `${(h / topHours) * 100}%` }} />
          ))}
          <div className="absolute inset-x-0 z-[1] border-t border-dashed border-stone-400" style={{ bottom: `${(TARGET_HOURS / topHours) * 100}%` }}>
            <span className="absolute right-0 -top-5 rounded bg-surface px-1 text-[11px] font-semibold text-stone-500">Target {TARGET_HOURS}h</span>
          </div>
        </div>
        {/* No time at all in this period: say so instead of a row of empty bars */}
        {total === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] grid h-40 place-items-center">
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">No time logged {mode === "week" && offset === 0 ? "this week yet" : "in this period"}</span>
          </div>
        )}
        <div key={`${mode}${offset}${from}${to}`} className={cx("relative flex h-40 items-end", gap)} onMouseLeave={() => setHover(null)}>
          {days.map((secs, i) => (
            <div
              key={i}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${slots[i].name}: ${formatHours(secs)}`}
            >
              {hover === i && (
                <span className="absolute -top-8 z-10 palette-fixed rounded-lg bg-stone-900 px-2 py-1 text-xs font-bold whitespace-nowrap text-white shadow-float">
                  {slots[i].name} · {formatHours(secs)}
                </span>
              )}
              <div
                className={cx(
                  "w-full max-w-10 origin-bottom animate-grow-y rounded-t-[4px] transition-all",
                  i === todayIdx ? "bg-brand-500" : hover === i ? "bg-brand-400" : "bg-brand-300",
                  secs === 0 && "!bg-stone-200",
                )}
                style={{ height: secs ? `${Math.max(4, (secs / max) * 100)}%` : "2px", animationDelay: `${i * (slots.length > 10 ? 15 : 50)}ms` }}
              />
            </div>
          ))}
        </div>
        <div className={cx("mt-2 flex", gap)}>
          {slots.map((d, i) => (
            <span key={d.start} className={cx("min-w-0 flex-1 text-center font-bold", slots.length > 10 ? "text-[10px]" : "text-[11px]", i === todayIdx ? "text-brand-600" : "text-stone-400")}>
              {d.label}
            </span>
          ))}
        </div>
      </div>
      </div>
      )}
    </Card>
  );
}

/**
 * Workdays in a row (Mon–Fri, not a holiday) with any time clocked, counting back from today.
 * Today only adds to the streak once you've clocked in; an empty morning doesn't break it.
 */
function workdayStreak(entries, holidays, now) {
  const days = new Set(entries.map((e) => toDateKey(e.start)));
  let streak = 0;
  let day = startOfDay(now);
  for (let i = 0; i < 3660; i++, day = addDays(day, -1)) {
    const key = toDateKey(day);
    const weekday = new Date(day).getDay();
    if (weekday === 0 || weekday === 6 || holidays.has(key)) continue; // days off don't count either way
    if (days.has(key)) streak++;
    else if (i > 0) break; // today without time yet: keep looking back
  }
  return streak;
}

const CONTINUE_ROWS = 7;

/**
 * The open subtasks you clocked on most recently, newest first, with your time on each and a
 * play button to pick it straight back up.
 */
function ContinueWork({ entries, now }) {
  const { index } = useStore();
  const bySub = new Map();
  for (const e of entries) {
    const r = bySub.get(e.subtaskId) ?? { last: 0, secs: 0 };
    r.last = Math.max(r.last, e.end ?? now);
    r.secs += entrySeconds(e, now);
    bySub.set(e.subtaskId, r);
  }
  const rows = [...bySub]
    .map(([id, r]) => ({ sub: index.get(id), ...r }))
    .filter((r) => r.sub && !isDone(r.sub))
    .sort((a, b) => b.last - a.last)
    .slice(0, CONTINUE_ROWS);

  return (
    <Card className="flex flex-col bg-gradient-to-br from-brand-50/70 via-surface to-surface p-5">
      <SectionTitle icon={ListChecks} title="Continue where you left off">
        <Button variant="ghost" size="sm" onClick={() => navigate("my")}>
          My work <ArrowRight className="size-3.5" />
        </Button>
      </SectionTitle>
      {!rows.length ? (
        <p className="py-8 text-center text-sm text-stone-400">Nothing to continue yet.</p>
      ) : (
        <ul className="-mx-2 flex-1 space-y-0.5">
          {rows.map(({ sub, last, secs }) => (
            <li key={sub.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-brand-50/70">
              <button type="button" onClick={() => openItem(sub.id)} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
                <StatusIcon status={sub.status} className="size-[18px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-stone-800 group-hover:text-brand-700">{sub.name}</span>
                  <span className="block truncate text-xs text-stone-400">{pathLabel(index, sub.id).replaceAll(" / ", " › ")}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] leading-tight text-stone-400 tabular-nums">
                  <span className="block font-bold text-stone-700">{formatHours(secs)}</span>
                  {timeAgo(last, now)}
                </span>
              </button>
              <ClockButton subtask={sub} />
            </li>
          ))}
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

/**
 * Everyone's clockings (no names) on the clients you work in, for the Billing cycles chart.
 * Your own data only has your time, so this comes from the database separately: on load, when your
 * own clockings change, and every 2 minutes while the page is showing.
 */
function useClientHoursEntries(ownEntries) {
  const [list, setList] = useState([]);
  const ownKey = ownEntries.map((e) => `${e.id}:${e.end ?? ""}`).join("|");
  useEffect(() => {
    let alive = true;
    const load = () => document.visibilityState === "visible" && loadClientHoursEntries().then((l) => alive && setList(l)).catch(() => {});
    load();
    const timer = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ownKey]);
  return list;
}

function PersonalDashboard() {
  const { entries, me, state } = useStore(); // your own time only
  const running = entries.some((e) => e.end == null);
  const now = useNow(running, 30_000);
  const revealRef = useReveal(); // cards appear as you scroll to them
  const clientEntries = useClientHoursEntries(entries);

  const today = secondsBetween(entries, startOfDay(now), now + 1, now);
  const holidays = useMemo(() => new Set((state.holidays ?? []).map((h) => h.day)), [state.holidays]);
  const streak = useMemo(() => workdayStreak(entries, holidays, now), [entries, holidays, now]);

  return (
    <div ref={revealRef} className="@container reveal space-y-4">
      <Hero name={me.name.split(" ")[0]}>
        {/* Same-size tiles, whatever each one holds */}
        <div className="grid w-full grid-cols-2 items-stretch gap-2.5 @3xl:w-[20rem]">
          <HeroStat label="Today" value={formatHours(today)} live={running} />
          <HeroStat label="Streak" icon={streak ? Fire : Flame} iconClass={streak ? "" : "text-white/40"} value={`${streak} ${streak === 1 ? "day" : "days"}`} />
        </div>
      </Hero>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <WeekChart entries={entries} now={now} />
        <ContinueWork entries={entries} now={now} />
      </div>

      {/* If there's no chart to show (no client with hours), Recent sessions takes the full width */}
      <div className="grid items-start gap-4 xl:grid-cols-2 [&>*]:min-w-0 [&>*:only-child]:col-span-full">
        <RecentSessions entries={entries} now={now} />
        {/* The team's billable hours per billing cycle, for the clients you work in */}
        <ClientCyclesCard entries={clientEntries} now={now} />
      </div>

    </div>
  );
}
