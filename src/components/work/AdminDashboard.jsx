import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, BadgeDollarSign, CircleSlash, Clock, PencilLine, Plus, Radio, Square, Timer, TriangleAlert, Users,
} from "lucide-react";
import { Legend, StackedBars } from "../charts";
import { useNow } from "../../hooks/useNow";
import { navigate, openItem } from "../../lib/router";
import { addDays, formatClock, formatDate, formatHours, formatTime, startOfWeek, timeAgo } from "../../lib/time";
import { BILLING_LABEL, assigneesOf, billingOf, entryBilling, entrySeconds, isDone, isOverdue, pathLabel, workingMembers } from "../../store/model";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import ClientHoursCard from "./ClientHoursCard";
import WorkloadCard from "./WorkloadCard";
import { Hero, HeroStat, StatTile } from "./DashboardParts";
import { Avatar, Button, Card, EmptyState, IconChip, Select, cx } from "../ui";

/*
 * Admin dashboard: the whole team at a glance.
 * Live clock-ins first (what's happening now), then this week's hours split by billing,
 * then every clocking (where the admin moves time between billable and non-billable),
 * team activity, and work that needs attention.
 */

const PAGE = 8; // activity rows per "Show more"
const LATEST = 5; // clockings on the dashboard; the rest are on Timesheets

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
function LiveNow({ team, entries, now }) {
  const { allIndex: index, actions } = useStore();
  const { confirm, toast } = useDialogs();
  const stop = (m, e) =>
    confirm({
      title: `Stop ${m.name.split(" ")[0]}'s timer?`,
      message: `It has been running since ${formatTime(e.start)} (${formatHours(entrySeconds(e, Date.now()))}). Use this when someone forgot to clock out. It's recorded in the change history.`,
      confirmLabel: "Stop timer",
      onConfirm: () => {
        actions.stopMemberTimer(m.id);
        toast("Timer stopped");
      },
    });
  const running = new Map(entries.filter((e) => e.end == null).map((e) => [e.memberId, e]));
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
              {e && <Button size="xs" variant="ghost" iconOnly icon={Square} aria-label={`Stop ${m.name}'s timer`} title="Stop timer" onClick={() => stop(m, e)} />}
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

/** The latest few clockings. The full, filterable list (and corrections) lives on Timesheets. */
function TeamEntries({ entries, now }) {
  const { allIndex: index, memberById, actions } = useStore();
  const { toast } = useDialogs();
  const rows = useMemo(() => [...entries].sort((a, b) => b.start - a.start).slice(0, LATEST), [entries]);

  const move = (e) => {
    const to = entryBilling(index, e) === "billable" ? "non-billable" : "billable";
    actions.setEntryBilling(e.id, to);
    toast(`Moved ${formatHours(entrySeconds(e, now))} to ${BILLING_LABEL[to].toLowerCase()}`);
  };

  return (
    <Card className="bg-gradient-to-br from-brand-50/70 via-surface to-surface p-5">
      <SectionTitle icon={Clock} title="Latest clockings">
        <Button size="sm" variant="soft" icon={ArrowRight} onClick={() => navigate("timesheets")}>
          All timesheets
        </Button>
      </SectionTitle>
      {!rows.length ? (
        <EmptyState icon={Clock} title="No clockings yet" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold tracking-wide text-stone-400 uppercase">
                <th className="px-2 pb-2">Member</th>
                <th className="px-2 pb-2">Subtask</th>
                <th className="w-36 px-2 pb-2">When</th>
                <th className="w-20 px-2 pb-2 text-right">Duration</th>
                <th className="w-36 px-2 pb-2 text-right">Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((e) => {
                const m = memberById.get(e.memberId);
                const sub = index.get(e.subtaskId);
                const live = e.end == null;
                const billing = entryBilling(index, e);
                const moved = e.billing && e.billing !== (billingOf(index, e.subtaskId) ?? "billable");
                return (
                  <tr key={e.id} className="hover:bg-stone-50">
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        {m && <Avatar member={m} size="xs" />}
                        <span className="truncate font-semibold text-stone-800">{m?.name.split(" ")[0] ?? "—"}</span>
                      </span>
                    </td>
                    <td className="max-w-0 px-2 py-2.5">
                      <button type="button" onClick={() => sub && openItem(sub.id)} className="block w-full truncate text-left font-semibold text-stone-800 hover:text-brand-700">
                        {sub?.name ?? "Deleted subtask"}
                      </button>
                      <span className="block truncate text-xs text-stone-400">
                        {e.source === "manual" && <PencilLine className="mr-1 inline size-3" />}
                        {sub ? pathLabel(index, sub.id).replaceAll(" / ", " › ") : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-stone-600">
                      {formatDate(e.start)} · {formatTime(e.start)}–{live ? "now" : formatTime(e.end)}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {live && <span className="mr-1.5 inline-block size-2 animate-pulse-dot rounded-full bg-emerald-500" />}
                      <span className="font-bold text-stone-900">{formatHours(entrySeconds(e, now))}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => move(e)}
                        title={`${moved ? "Moved by admin. " : ""}Move to ${billing === "billable" ? "non-billable" : "billable"}`}
                        className={cx(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition",
                          billing === "billable" ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                        )}
                      >
                        {billing === "billable" ? <BadgeDollarSign className="size-3" /> : <CircleSlash className="size-3" />}
                        {BILLING_LABEL[billing]}
                        {moved && <span aria-label="moved" className="size-1.5 rounded-full bg-current opacity-60" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** What the team has been doing: status changes, assignments, timers, comments. */
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
                    <span className="font-bold text-stone-900">{m?.name.split(" ")[0] ?? "Someone"}</span> {a.kind === "comment" ? "commented: " : ""}
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

/** Open subtasks across the team that are overdue or at 80%+ of their estimate. */
function NeedsAttention({ entries, now }) {
  const { items, index, memberById } = useStore();
  const rows = items
    .filter((s) => s.type === "subtask" && !isDone(s))
    .map((s) => {
      const secs = entries.filter((e) => e.subtaskId === s.id).reduce((t, e) => t + entrySeconds(e, now), 0);
      const pct = s.estimate ? (secs / (s.estimate * 3600)) * 100 : 0;
      return { s, secs, pct, late: isOverdue(s) };
    })
    .filter((r) => r.late || r.pct >= 80)
    .sort((a, b) => b.late - a.late || b.pct - a.pct);

  return (
    <Card className="bg-gradient-to-br from-amber-50 via-surface to-surface p-5">
      <SectionTitle icon={TriangleAlert} title="Needs attention" />
      {!rows.length ? (
        <p className="py-6 text-center text-sm text-stone-400">Everything is on time and within estimate.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ s, secs, pct, late }) => {
            const over = late || pct > 100;
            const people = assigneesOf(s).map((id) => memberById.get(id)).filter(Boolean);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => openItem(s.id)} className="group block w-full text-left">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold text-stone-800 group-hover:text-brand-700">{s.name}</span>
                    <span className={cx("shrink-0 text-xs font-bold", over ? "text-red-600" : "text-amber-600")}>
                      {late ? "Late" : over ? "Over" : "Close"} · {formatHours(secs)}
                      {s.estimate ? ` of ${s.estimate}h` : ""}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-stone-400">
                    {people.map((p) => p.name.split(" ")[0]).join(", ") || "Unassigned"} · {pathLabel(index, s.id).replaceAll(" / ", " › ")}
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

export default function AdminDashboard() {
  const { state, teamEntries, allIndex: index, me } = useStore();
  // Team members, plus the admin once they take on work themself.
  const { openEntryForm } = useDialogs();
  const team = workingMembers(state.members, state.items, teamEntries);
  const anyRunning = teamEntries.some((e) => e.end == null);
  const now = useNow(anyRunning, 1000); // live timers tick every second

  const weekStart = startOfWeek(now);
  const week = teamEntries.filter((e) => (e.end ?? now) > weekStart);
  const total = secondsBetween(week, weekStart, now + 1, now);
  const billable = secondsBetween(week.filter((e) => entryBilling(index, e) === "billable"), weekStart, now + 1, now);
  const live = new Set(teamEntries.filter((e) => e.end == null).map((e) => e.memberId)).size;

  return (
    <div className="@container space-y-4">
      <Hero name={me.name.split(" ")[0]} title="Here's how the team is doing today">
        <HeroStat label="On the clock" value={`${live} / ${team.length}`} live={live > 0} />
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

      {/* Client hours (accordion) beside Workload; same height on wide screens */}
      <div className="grid items-stretch gap-4 xl:grid-cols-[1.15fr_1fr]">
        <ClientHoursCard entries={teamEntries} now={now} />
        <WorkloadCard />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <LiveNow team={team} entries={teamEntries} now={now} />
        <TeamHours team={team} entries={teamEntries} now={now} />
      </div>

      <TeamEntries entries={teamEntries} now={now} />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <TeamActivity now={now} />
        <NeedsAttention entries={teamEntries} now={now} />
      </div>
    </div>
  );
}
