import { useState } from "react";
import { Activity, BadgeDollarSign, ChevronLeft, ChevronRight, CircleSlash, Radio, Timer, Users } from "lucide-react";
import { Legend, StackedBars } from "../charts";
import { useNow } from "../../hooks/useNow";
import { navigate, openItem } from "../../lib/router";
import { addDays, formatClock, formatDate, formatHours, formatTime, fromDateKey, startOfWeek, timeAgo, toDateKey } from "../../lib/time";
import { entryBilling, entrySeconds, pathLabel, workingMembers } from "../../store/model";
import { useStore } from "../../store/store";
import ClientHoursCard from "./ClientHoursCard";
import ClientCyclesCard from "./ClientCyclesCard";
import { Hero, StatStrip, StatTile } from "./DashboardParts";
import { Avatar, Card, IconChip, cx, inputClass } from "../ui";
import { Segmented } from "../admin/AdminPage";
import { useReveal } from "../motion";

/*
 * Admin dashboard: the whole team at a glance.
 * This week's totals, client hours and who's on the clock, billing cycles, workload and
 * hours per person, then team activity. Every clocking is on the Timesheets page.
 */

const PAGE = 8; // activity rows per "Show more"

/** Seconds of `entries` inside [from, to), clipping entries that cross the edges. */
function secondsBetween(entries, from, to, now) {
  let total = 0;
  for (const e of entries) {
    const start = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to);
    if (end > start) total += (end - start) / 1000;
  }
  return total;
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

/** Who is clocked in right now, ticking every second. */
function LiveNow({ team, entries, now: pageNow }) {
  const { allIndex: index } = useStore();
  const running = new Map(entries.filter((e) => e.end == null).map((e) => [e.memberId, e]));
  // Only this card ticks every second (for the running clocks).
  const tick = useNow(running.size > 0, 1000);
  const now = running.size ? tick : pageNow;
  const lastEnd = (id) => Math.max(0, ...entries.filter((e) => e.memberId === id && e.end).map((e) => e.end));
  // Clocked-in people first, longest session on top.
  const rows = [...team].sort((a, b) => (running.get(a.id)?.start ?? Infinity) - (running.get(b.id)?.start ?? Infinity));
  // Only the people working are listed; everyone else folds into one line you can open.
  const [showIdle, setShowIdle] = useState(false);
  const idle = rows.length - running.size;
  const shown = showIdle ? rows : rows.filter((m) => running.has(m.id));

  return (
    <Card className="bg-gradient-to-br from-emerald-50 via-surface to-surface p-5">
      <SectionTitle icon={Radio} title="On the clock now">
        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
          <span className="size-2 animate-pulse-dot rounded-full bg-emerald-500" /> Live
        </span>
      </SectionTitle>
      {!running.size && <p className="py-1 text-sm text-stone-500">Nobody is clocked in right now.</p>}
      <ul className="divide-y divide-stone-100">
        {shown.map((m) => {
          const e = running.get(m.id);
          const sub = e ? index.get(e.subtaskId) : null;
          const last = lastEnd(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              {/* Picture and name open their profile; the subtask line opens the subtask */}
              <button type="button" onClick={() => navigate("team", m.id)} aria-label={`Open ${m.name}'s profile`} className="relative shrink-0 rounded-full transition hover:scale-105">
                <Avatar member={m} size="sm" />
                {e && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />}
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => navigate("team", m.id)} className="block max-w-full truncate text-left text-sm font-bold text-stone-800 hover:text-brand-700">
                  {m.name}
                </button>
                {e ? (
                  <button type="button" onClick={() => sub && openItem(sub.id)} className="block max-w-full truncate text-left text-xs text-stone-500 hover:text-brand-700">
                    {sub?.name ?? "Subtask"} <span className="text-stone-400">· {sub ? pathLabel(index, sub.id).replaceAll(" / ", " › ") : ""}</span>
                  </button>
                ) : (
                  <p className="text-xs text-stone-400">{last ? `Not clocked in · last worked ${timeAgo(last, now)}` : "Not clocked in"}</p>
                )}
              </div>
              {e && (
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-bold text-emerald-700 tabular-nums">{formatClock(entrySeconds(e, now))}</span>
                  <span className="block text-[11px] text-stone-400">since {formatTime(e.start)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {idle > 0 && (
        <button type="button" onClick={() => setShowIdle((v) => !v)} className="mt-1 w-full border-t border-stone-100 pt-2.5 text-left text-xs font-semibold text-stone-500 hover:text-stone-800">
          {showIdle ? "Hide people not clocked in" : `${idle} not clocked in · show`}
        </button>
      )}
    </Card>
  );
}

/** Hours per person for a week, a month or any dates, split billable / non-billable. */
function TeamHours({ team, entries, now }) {
  const { index } = useStore();
  const [mode, setMode] = useState("week"); // week | month | custom
  const [offset, setOffset] = useState(0); // weeks or months back from the current one
  const [fromKey, setFromKey] = useState(() => toDateKey(startOfWeek(now)));
  const [toKey, setToKey] = useState(() => toDateKey(now));
  const pickMode = (m) => {
    setMode(m);
    setOffset(0);
  };

  // The period on show as [from, to), and what to call it.
  let from, to, title;
  if (mode === "week") {
    from = addDays(startOfWeek(now), offset * 7);
    to = Math.min(addDays(from, 7), now + 1);
    title = offset === 0 ? "This week" : offset === -1 ? "Last week" : `${formatDate(from)} – ${formatDate(addDays(from, 4))}`;
  } else if (mode === "month") {
    const d = new Date(now);
    from = new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
    to = Math.min(new Date(d.getFullYear(), d.getMonth() + offset + 1, 1).getTime(), now + 1);
    title = formatDate(from, { month: "long", year: "numeric" });
  } else {
    from = fromDateKey(fromKey);
    to = Math.min(addDays(fromDateKey(toKey), 1), now + 1);
    title = fromKey === toKey ? formatDate(from, { weekday: "long", day: "numeric", month: "short" }) : `${formatDate(from)} – ${formatDate(fromDateKey(toKey))}`;
  }
  const rows = team
    .map((m) => {
      const mine = entries.filter((e) => e.memberId === m.id);
      const billable = secondsBetween(mine.filter((e) => entryBilling(index, e) === "billable"), from, to, now);
      const non = secondsBetween(mine.filter((e) => entryBilling(index, e) !== "billable"), from, to, now);
      return { m, billable, non, total: billable + non };
    })
    .sort((a, b) => b.total - a.total);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const arrow = "grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:pointer-events-none disabled:opacity-30";

  return (
    <Card className="bg-gradient-to-br from-violet-50 via-surface to-surface p-5">
      <SectionTitle icon={Users} title="Team hours">
        <Segmented size="sm" label="Period" value={mode} onChange={pickMode} options={[["week", "Week"], ["month", "Month"], ["custom", "Custom"]]} />
      </SectionTitle>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">
          <span className="text-2xl font-extrabold text-stone-900">{formatHours(total)}</span> {title}
        </p>
        {mode === "custom" ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <input type="date" aria-label="From" value={fromKey} max={toKey} onChange={(e) => e.target.value && setFromKey(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
            to
            <input type="date" aria-label="To" value={toKey} min={fromKey} max={toDateKey(now)} onChange={(e) => e.target.value && setToKey(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <button type="button" aria-label={`Previous ${mode}`} onClick={() => setOffset((o) => o - 1)} className={arrow}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" aria-label={`Next ${mode}`} disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} className={arrow}>
              <ChevronRight className="size-4" />
            </button>
          </span>
        )}
      </div>
      <div className="mb-4">
        <Legend />
      </div>
      <StackedBars rows={rows.map(({ m, billable, non }) => ({ key: m.id, label: m.name, lead: <Avatar member={m} size="xs" />, billable, non }))} />
    </Card>
  );
}

/** What the team has been doing: status changes, assignments, timers. */
function TeamActivity({ now }) {
  const { activity, index, memberById } = useStore();
  const [shown, setShown] = useState(PAGE);
  const rows = activity.slice(0, shown);

  return (
    <Card className="bg-gradient-to-br from-sky-50 via-surface to-surface p-5">
      <SectionTitle icon={Activity} title="Team activity" />
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-stone-400">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const m = memberById.get(a.memberId);
            const item = index.get(a.itemId);
            return (
              <li key={a.id} className="flex gap-2.5">
                {m ? <Avatar member={m} size="xs" className="mt-0.5" /> : <span className="size-5" />}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-stone-700">
                    <span className="font-bold text-stone-900">{m?.name.split(" ")[0] ?? "Someone"}</span>{" "}
                    {a.text}
                  </p>
                  <p className="truncate text-xs text-stone-400">
                    {item && (
                      <button type="button" onClick={() => openItem(item.id)} className="hover:text-brand-700">
                        {item.name}
                      </button>
                    )}
                    {item && " · "}
                    {timeAgo(a.at, now)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {activity.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 text-xs font-bold text-brand-600 hover:underline">
          Show more
        </button>
      )}
    </Card>
  );
}


export default function AdminDashboard() {
  const { state, teamEntries, allIndex: index, me } = useStore();
  const revealRef = useReveal(); // cards appear as you scroll to them
  // Team members, plus the admin once they take on work themself.
  const team = workingMembers(state.members, state.items, teamEntries);
  const anyRunning = teamEntries.some((e) => e.end == null);
  // The page refreshes its numbers every 30 s; only the "On the clock" card ticks every second (its own timer),
  // so the whole dashboard isn't recalculated every second while someone is clocked in.
  const now = useNow(anyRunning, 30_000);

  const weekStart = startOfWeek(now);
  const week = teamEntries.filter((e) => (e.end ?? now) > weekStart);
  const total = secondsBetween(week, weekStart, now + 1, now);
  const billable = secondsBetween(week.filter((e) => entryBilling(index, e) === "billable"), weekStart, now + 1, now);
  const live = new Set(teamEntries.filter((e) => e.end == null).map((e) => e.memberId)).size;

  return (
    <div ref={revealRef} className="@container reveal space-y-4">
      <Hero name={me.name.split(" ")[0]} />

      <StatStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <StatTile bare icon={Radio} tone="emerald" label="Clocked in now" value={`${live} / ${team.length}`} />
        <StatTile bare icon={Timer} tone="brand" label="Team hours this week" value={formatHours(total)} sub={`${formatDate(weekStart)} to today`} />
        <StatTile
          bare
          icon={BadgeDollarSign}
          tone="violet"
          label="Billable this week"
          value={formatHours(billable)}
          sub={total ? `${Math.round((billable / total) * 100)}% of team time` : "No time yet"}
        />
        <StatTile bare icon={CircleSlash} tone="sky" label="Non-billable this week" value={formatHours(total - billable)} />
      </StatStrip>

      {/* Client hours (accordion) beside who's on the clock; same height on wide screens */}
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <ClientHoursCard entries={teamEntries} now={now} />
        <LiveNow team={team} entries={teamEntries} now={now} />
      </div>

      {/* Full width: billable hours in each billing cycle, one client at a time */}
      <ClientCyclesCard entries={teamEntries} now={now} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <TeamActivity now={now} />
        <TeamHours team={team} entries={teamEntries} now={now} />
      </div>
    </div>
  );
}
