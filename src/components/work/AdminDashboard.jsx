import { useState } from "react";
import { Activity, BadgeDollarSign, CircleSlash, Plus, Radio, Timer, Users } from "lucide-react";
import { Legend, StackedBars } from "../charts";
import { useNow } from "../../hooks/useNow";
import { openItem } from "../../lib/router";
import { addDays, formatClock, formatDate, formatHours, formatTime, startOfWeek, timeAgo } from "../../lib/time";
import { entryBilling, entrySeconds, pathLabel, workingMembers } from "../../store/model";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import ClientHoursCard from "./ClientHoursCard";
import ClientCyclesCard from "./ClientCyclesCard";
import WorkloadCard from "./WorkloadCard";
import { Hero, HeroStat, StatTile } from "./DashboardParts";
import { Avatar, Button, Card, IconChip, cx } from "../ui";
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

  return (
    <Card className="bg-gradient-to-br from-emerald-50 via-surface to-surface p-5">
      <SectionTitle icon={Radio} title="On the clock now">
        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
          <span className="size-2 animate-pulse-dot rounded-full bg-emerald-500" /> Live
        </span>
      </SectionTitle>
      <ul className="divide-y divide-stone-100">
        {rows.map((m) => {
          const e = running.get(m.id);
          const sub = e ? index.get(e.subtaskId) : null;
          const last = lastEnd(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <span className="relative">
                <Avatar member={m} size="sm" />
                {e && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-stone-800">{m.name}</p>
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
    </Card>
  );
}

/** Hours per person for a week, split billable / non-billable. */
function TeamHours({ team, entries, now }) {
  const { index } = useStore();
  const [which, setWhich] = useState("this");
  const from = which === "this" ? startOfWeek(now) : addDays(startOfWeek(now), -7);
  const to = which === "this" ? now + 1 : startOfWeek(now);
  const rows = team
    .map((m) => {
      const mine = entries.filter((e) => e.memberId === m.id);
      const billable = secondsBetween(mine.filter((e) => entryBilling(index, e) === "billable"), from, to, now);
      const non = secondsBetween(mine.filter((e) => entryBilling(index, e) !== "billable"), from, to, now);
      return { m, billable, non, total: billable + non };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <Card className="bg-gradient-to-br from-violet-50 via-surface to-surface p-5">
      <SectionTitle icon={Users} title="Team hours">
        <div role="group" aria-label="Week" className="flex rounded-full bg-stone-100 p-0.5">
          {[["this", "This week"], ["last", "Last week"]].map(([k, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={which === k}
              onClick={() => setWhich(k)}
              className={cx("rounded-full px-3 py-1 text-xs font-bold transition", which === k ? "bg-surface text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}
            >
              {t}
            </button>
          ))}
        </div>
      </SectionTitle>
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
  const { openEntryForm } = useDialogs();
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
      <Hero name={me.name.split(" ")[0]} title="Here's how the team is doing today">
        <HeroStat label="Billable share" value={total ? `${Math.round((billable / total) * 100)}%` : "—"} />
        <Button variant="primary" icon={Plus} onClick={() => openEntryForm({})}>
          Log time
        </Button>
      </Hero>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Radio} tone="emerald" label="Clocked in now" value={`${live} / ${team.length}`} sub={live ? "Working right now" : "Nobody is clocked in"} />
        <StatTile icon={Timer} tone="brand" label="Team hours this week" value={formatHours(total)} sub={`${formatDate(weekStart)} to today`} />
        <StatTile
          icon={BadgeDollarSign}
          tone="violet"
          label="Billable this week"
          value={formatHours(billable)}
          sub={total ? `${Math.round((billable / total) * 100)}% of team time` : "No time yet"}
        />
        <StatTile icon={CircleSlash} tone="sky" label="Non-billable this week" value={formatHours(total - billable)} sub="Internal and unbilled work" />
      </div>

      {/* Client hours (accordion) beside who's on the clock; same height on wide screens */}
      <div className="grid items-stretch gap-4 xl:grid-cols-[1.15fr_1fr]">
        <ClientHoursCard entries={teamEntries} now={now} />
        <LiveNow team={team} entries={teamEntries} now={now} />
      </div>

      {/* Full width: billable hours in each billing cycle, one client at a time */}
      <ClientCyclesCard entries={teamEntries} now={now} />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <WorkloadCard />
        <TeamHours team={team} entries={teamEntries} now={now} />
      </div>

      <TeamActivity now={now} />
    </div>
  );
}
