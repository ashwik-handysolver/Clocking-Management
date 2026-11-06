import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Briefcase, Calendar, Camera, ChevronLeft, ChevronRight, Clock, Copy, Crown, ListTodo, Mail,
  Pencil, PencilLine, Plus, RotateCcw, Settings2, Timer, Trash, UserMinus, UserRound,
} from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { navigate, openItem } from "../../lib/router";
import {
  DAY, dueInfo, formatDate, formatHours, formatTime, fromDateKey, startOfDay, startOfWeek, timeAgo, toDateKey, todayKey,
} from "../../lib/time";
import { ancestry, assigneesOf, entryBilling, entrySeconds, isDone, pathLabel } from "../../store/model";
import { listSnapshots, snapshotUrls } from "../../store/db";
import { useStore } from "../../store/store";
import AddWizard from "../AddSubtaskWizard";
import { Legend, StackedBars } from "../charts";
import { useDialogs } from "../dialogs";
import { CountUp, DoneName, useReveal } from "../motion";
import { Avatar, Button, Card, EmptyState, IconChip, Popover, Select, StatusIcon, cx, inputClass } from "../ui";
import { Hero, StatTile } from "../work/DashboardParts";
import { AdminPage, Segmented } from "./AdminPage";
import { EditMember, sortedTeam, useMemberActions } from "./TeamPage";

/*
 * One team member's profile (admin, from the Team page): who they are, their hours (this week,
 * this month, all time or a custom range), billable share, day-by-day hours, the clients and projects they worked on,
 * their subtasks, latest clockings and latest screenshots.
 */

const RANGES = [
  ["week", "This week"],
  ["month", "This month"],
  ["all", "All time"],
  ["custom", "Custom"],
];
/** `ts` moved by `n` whole months (day clamped to the month's length). */
const addMonths = (ts, n) => {
  const d = new Date(ts);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
};

const monthStart = (now) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

/** Seconds of `entries` inside [from, to), clipping entries that cross the edges. */
function secondsBetween(entries, from, to, now) {
  let total = 0;
  for (const e of entries) {
    const s = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to);
    if (end > s) total += (end - s) / 1000;
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

export default function MemberProfile({ memberId }) {
  const { state, items, allIndex: index, teamEntries, memberById, me } = useStore();
  const { openEntryForm, toast } = useDialogs();
  const { askRemove, askDelete, allowBack, askAccess } = useMemberActions();
  const member = memberById.get(memberId);
  const mine = useMemo(() => teamEntries.filter((e) => e.memberId === memberId), [teamEntries, memberId]);
  const live = mine.find((e) => e.end == null);
  const now = useNow(Boolean(live), 30_000);
  const [range, setRange] = useState("month");
  const [customFrom, setCustomFrom] = useState(() => toDateKey(monthStart(Date.now())));
  const [customTo, setCustomTo] = useState(() => todayKey());
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const revealRef = useReveal();

  // Previous / next person, in the Team list's order
  const team = sortedTeam(state.members);
  const at = team.findIndex((m) => m.id === memberId);
  const prev = at > 0 ? team[at - 1] : null;
  const next = at >= 0 && at < team.length - 1 ? team[at + 1] : null;

  if (!member) {
    return (
      <AdminPage title="Team member">
        <Card>
          <EmptyState icon={Briefcase} title="This team member doesn't exist any more" />
        </Card>
      </AdminPage>
    );
  }

  // The chosen period: [from, until)
  const from =
    range === "week" ? startOfWeek(now) : range === "month" ? monthStart(now) : range === "custom" ? fromDateKey(customFrom) : 0;
  const until = range === "custom" ? fromDateKey(customTo) + DAY : now + 1;
  const rangeKey = range === "custom" ? `${customFrom}-${customTo}` : range; // numbers count up again when it changes
  const inRange = mine.filter((e) => (e.end ?? now) > from && e.start < until);
  const total = secondsBetween(inRange, from, until, now);
  const sessions = inRange.length;
  const daysWorked = new Set(inRange.map((e) => new Date(e.start).toDateString())).size;

  // Their subtasks
  const assigned = items.filter((s) => s.type === "subtask" && assigneesOf(s).includes(memberId));
  const open = assigned.filter((s) => !isDone(s));

  // Clients and projects they worked on, in the chosen range
  const projectRows = (() => {
    const byProject = new Map();
    for (const e of inRange) {
      const chain = ancestry(index, e.subtaskId);
      const project = chain.find((x) => x.type === "project");
      const client = chain.find((x) => x.type === "client");
      const key = project?.id ?? client?.id ?? "other";
      const row = byProject.get(key) ?? {
        key,
        label: project ? `${client?.name ?? ""} › ${project.name}` : client?.name ?? "Deleted work",
        billable: 0,
        non: 0,
        onClick: project ? () => openItem(project.id) : undefined,
      };
      const secs = secondsBetween([e], from, until, now);
      if (entryBilling(index, e) === "billable") row.billable += secs;
      else row.non += secs;
      byProject.set(key, row);
    }
    return [...byProject.values()].filter((r) => r.billable + r.non > 0).sort((a, b) => b.billable + b.non - (a.billable + a.non));
  })();

  // The team's average per day worked, same period: all hours ÷ every (person, day) with time logged.
  const teamAvg = (() => {
    const perPersonDay = new Map();
    for (const e of teamEntries) {
      if ((e.end ?? now) <= from || e.start >= until) continue;
      const key = `${e.memberId}|${new Date(e.start).toDateString()}`;
      perPersonDay.set(key, (perPersonDay.get(key) ?? 0) + secondsBetween([e], from, until, now));
    }
    const secs = [...perPersonDay.values()].reduce((a, b) => a + b, 0);
    return perPersonDay.size ? secs / perPersonDay.size : 0;
  })();

  const recent = [...mine].sort((a, b) => b.start - a.start).slice(0, 8);
  const lastWorked = mine.reduce((t, e) => Math.max(t, e.end ?? now), 0);
  const role = member.isAdmin ? "Admin" : member.role || "Team member";
  const self = member.id === me.id;
  // Same rules as the Team list: subtasks go to team members (or the admin to themself);
  // admins delete team members, or their own account while another admin remains.
  const canAssign = !member.removedAt && (!member.isAdmin || self);
  const adminCount = team.filter((m) => m.isAdmin).length;
  const canDelete = !member.isAdmin || (self && adminCount > 1);

  return (
    <AdminPage title="Team member">
      <div ref={revealRef} className="@container reveal space-y-4">
        {/* Back to the list, and step through the team without going back */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => navigate("team")}>
            Team
          </Button>
          {at >= 0 && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} disabled={!prev} onClick={() => prev && navigate("team", prev.id)} aria-label={prev ? `Previous: ${prev.name}` : "Previous"} title={prev?.name} />
              <Select
                value={memberId}
                onChange={(e) => navigate("team", e.target.value)}
                options={team.map((m) => ({ value: m.id, label: m.name }))}
                className="!h-9 w-48"
                aria-label="Switch person"
              />
              <span className="hidden shrink-0 text-xs font-semibold whitespace-nowrap text-stone-400 tabular-nums sm:inline">
                {at + 1} of {team.length}
              </span>
              <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} disabled={!next} onClick={() => next && navigate("team", next.id)} aria-label={next ? `Next: ${next.name}` : "Next"} title={next?.name} />
            </div>
          )}
        </div>

        {/* Who they are */}
        <Hero
          name={member.name}
          greeting={false}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>{role}</span>
              {member.isAdmin && <Crown className="size-5" />}
            </span>
          }
          lead={<Avatar member={member} size="xl" className="ring-4 ring-white/30" />}
          details={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <Mail className="size-4 shrink-0" /> <span className="truncate">{member.email}</span>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(member.email)
                      .then(() => toast("Email copied"))
                      .catch(() => toast("Couldn't copy the email", "error"))
                  }
                  aria-label="Copy email"
                  title="Copy email"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/15 hover:text-white"
                >
                  <Copy className="size-3.5" />
                </button>
              </span>
              {member.createdAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4" /> Joined {formatDate(member.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className={cx("size-2 rounded-full", live ? "animate-pulse-dot bg-emerald-400" : "bg-white/50")} />
                {live
                  ? `Clocked in now on ${index.get(live.subtaskId)?.name ?? "a subtask"}`
                  : lastWorked
                    ? `Last worked ${timeAgo(lastWorked, now)}`
                    : "Hasn't clocked in yet"}
              </span>
            </span>
          }
        >
          {/* Quick actions */}
          {canAssign && (
            <Button variant="primary" icon={Plus} onClick={() => setAssigning(true)}>
              Assign subtask
            </Button>
          )}
          <Button variant="secondary" icon={Clock} onClick={() => openEntryForm({ memberId })}>
            Log time
          </Button>
          {/* Manage: the same actions as on the Team list */}
          <Popover
            align="right"
            className="w-60"
            trigger={({ toggle, open }) => (
              <Button variant="secondary" icon={Settings2} onClick={toggle} aria-expanded={open}>
                Manage
              </Button>
            )}
          >
            {(close) => {
              const item = (icon, label, onClick, danger) => {
                const Icon = icon;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onClick();
                    }}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold",
                      danger ? "text-red-600 hover:bg-red-50" : "text-stone-700 hover:bg-stone-50",
                    )}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                );
              };
              return (
                <div className="space-y-0.5">
                  {item(Pencil, "Edit details", () => setEditing(true))}
                  {!self && !member.removedAt && item(member.isAdmin ? UserRound : Crown, member.isAdmin ? "Make team member" : "Make admin", () => askAccess(member))}
                  {!self && !member.isAdmin && !member.removedAt && item(UserMinus, "Remove from team", () => askRemove(member))}
                  {member.removedAt && item(RotateCcw, "Allow back", () => allowBack(member))}
                  {canDelete && item(Trash, self ? "Delete my account" : "Delete account", () => askDelete(member, () => navigate("team")), true)}
                </div>
              );
            }}
          </Popover>
        </Hero>

        {/* Hours in the chosen range */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {range === "custom" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
                <input type="date" aria-label="From" value={customFrom} max={customTo} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
                to
                <input type="date" aria-label="To" value={customTo} min={customFrom} onChange={(e) => e.target.value && setCustomTo(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
              </span>
            )}
            <Segmented label="Period" value={range} onChange={setRange} options={RANGES} size="sm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <StatTile key={`t-${rangeKey}`} icon={Timer} tone="brand" label="Hours clocked" value={formatHours(total)} sub={`${sessions} clocking${sessions === 1 ? "" : "s"} · ${daysWorked} day${daysWorked === 1 ? "" : "s"}`} />
            <CompareCard key={`c-${rangeKey}`} name={member.name.split(" ")[0]} mine={daysWorked ? total / daysWorked : 0} team={teamAvg} />
          </div>
        </div>

        {/* Last 14 days, and where the time went */}
        <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          {/* Clicking a month shows that month in the numbers above */}
          <HoursChart
            entries={mine}
            onPick={(start, lastDay) => {
              setRange("custom");
              setCustomFrom(toDateKey(start));
              setCustomTo(toDateKey(lastDay));
            }}
          />
          <Card className="p-5">
            <SectionTitle icon={Briefcase} title="Clients & projects" />
            {projectRows.length ? (
              <>
                <StackedBars rows={projectRows} />
                <div className="mt-4">
                  <Legend />
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-stone-400">No time in this period.</p>
            )}
          </Card>
        </div>

        {/* Their latest screenshots */}
        <ShotsPreview member={member} />

        {/* Their subtasks and latest clockings */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <SectionTitle icon={ListTodo} title={`Subtasks (${open.length} open)`} />
            {assigned.length ? (
              <ul className="-mx-2 max-h-96 space-y-0.5 overflow-y-auto scrollbar-thin" data-lenis-prevent>
                {[...open, ...assigned.filter(isDone)].map((s) => {
                  const due = dueInfo(s.due, isDone(s));
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => openItem(s.id)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-brand-50/70">
                        <StatusIcon status={s.status} className="size-[18px] shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className={cx("block truncate text-sm font-bold text-stone-800 group-hover:text-brand-700", isDone(s) && "!text-stone-400")}>
                            <DoneName item={s}>{s.name}</DoneName>
                          </span>
                          <span className="block truncate text-xs text-stone-400">{pathLabel(index, s.id).replaceAll(" / ", " › ")}</span>
                        </span>
                        {s.due && <span className={cx("shrink-0 text-xs font-semibold", due.tone === "danger" ? "text-red-600" : "text-stone-500")}>{due.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-stone-400">No subtasks assigned.</p>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Timer} title="Latest clockings" />
            {recent.length ? (
              <ul className="divide-y divide-stone-100">
                {recent.map((e) => {
                  const sub = index.get(e.subtaskId);
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => sub && openItem(sub.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-stone-800">{sub?.name ?? "Deleted subtask"}</span>
                          <span className="block truncate text-xs text-stone-400">
                            {formatDate(e.start)} · {formatTime(e.start)}–{e.end ? formatTime(e.end) : "now"}
                            {e.source === "manual" && (
                              <>
                                {" "}
                                · <PencilLine className="mb-0.5 inline size-3" /> manual
                              </>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold text-stone-900 tabular-nums">
                          {e.end == null && <span className="mr-1.5 inline-block size-2 animate-pulse-dot rounded-full bg-emerald-500" />}
                          {formatHours(entrySeconds(e, now))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-stone-400">No clockings yet.</p>
            )}
          </Card>
        </div>

      </div>

      {assigning && <AddWizard kind="subtask" assignees={[member.id]} onClose={() => setAssigning(false)} toast={toast} />}
      {editing && <EditMember member={member} onClose={() => setEditing(false)} />}
    </AdminPage>
  );
}

/** Their 4 latest screenshots, with a link to all of them. */
function ShotsPreview({ member }) {
  const [shots, setShots] = useState(null); // null = loading
  const [urls, setUrls] = useState(new Map());
  useEffect(() => {
    let alive = true;
    listSnapshots({ memberId: member.id, limit: 4 })
      .then(async (list) => {
        if (!alive) return;
        setShots(list);
        if (list.length) {
          const m = await snapshotUrls(list.map((s) => s.path));
          if (alive) setUrls(m);
        }
      })
      .catch(() => alive && setShots([]));
    return () => {
      alive = false;
    };
  }, [member.id]);

  return (
    <Card className="p-5">
      <SectionTitle icon={Camera} title="Latest screenshots">
        <Button size="sm" variant="ghost" onClick={() => navigate("screenshots", null, { member: member.id })}>
          View all <ChevronRight className="size-3.5" />
        </Button>
      </SectionTitle>
      {shots && !shots.length ? (
        <p className="py-6 text-center text-sm text-stone-400">No screenshots yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          {(shots ?? [0, 1, 2, 3]).map((s, i) => (
            <li key={s?.id ?? i}>
              <button
                type="button"
                disabled={!s}
                onClick={() => s && navigate("screenshots", null, { member: member.id, date: toDateKey(s.takenAt) })}
                className="group block w-full overflow-hidden rounded-xl bg-stone-100 text-left ring-1 ring-stone-900/5 transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <span className={cx("relative block aspect-video bg-stone-200/70", !s && "animate-skeleton")}>
                  {s && urls.get(s.path) && <img src={urls.get(s.path)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
                </span>
                {s && (
                  <span className="block px-2.5 py-1.5 text-[11px] font-semibold text-stone-500">
                    {formatDate(s.takenAt)} · {formatTime(s.takenAt)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Their average hours per day worked next to the team's, for the chosen period. */
function CompareCard({ name, mine, team }) {
  const diff = mine - team;
  const flat = Math.abs(diff) < 60; // within a minute
  return (
    <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
      <div>
        <p className="text-xs font-bold tracking-wide text-stone-600 uppercase">{name} · per day</p>
        <p className="text-3xl font-black tracking-tight text-stone-900 tabular-nums">
          <CountUp text={formatHours(mine)} />
        </p>
      </div>
      <span
        className={cx(
          "rounded-full px-3 py-1 text-sm font-extrabold tabular-nums",
          flat ? "bg-stone-100 text-stone-600" : diff > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
        )}
      >
        {flat ? "=" : `${diff > 0 ? "+" : "−"}${formatHours(Math.abs(diff))}`}
      </span>
      <div>
        <p className="text-xs font-bold tracking-wide text-stone-600 uppercase">Team · per day</p>
        <p className="text-3xl font-black tracking-tight text-stone-400 tabular-nums">
          <CountUp text={formatHours(team)} />
        </p>
      </div>
    </Card>
  );
}

const SPANS = [
  ["2", "2 months"],
  ["3", "3 months"],
  ["6", "6 months"],
  ["custom", "Custom"],
];
const monthKey = (ts) => toDateKey(ts).slice(0, 7); // "2026-11"
const fromMonthKey = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).getTime();
};

/** Hours clocked per month: one bar each, with the hours on top. Click a month to show it in the numbers above. */
function HoursChart({ entries, onPick }) {
  const [span, setSpan] = useState("6"); // last 6 months by default
  const [customFrom, setCustomFrom] = useState(() => monthKey(addMonths(Date.now(), -5)));
  const [customTo, setCustomTo] = useState(() => monthKey(Date.now()));
  const now = Date.now();
  const thisMonth = monthStart(now);

  const first = span === "custom" ? fromMonthKey(customFrom) : addMonths(thisMonth, -(Number(span) - 1));
  const last = span === "custom" ? fromMonthKey(customTo) : thisMonth;
  const months = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) {
    const end = addMonths(m, 1);
    months.push({ start: m, end, secs: secondsBetween(entries, m, end, now) });
  }
  const top = Math.max(...months.map((m) => m.secs), 3600) * 1.15; // headroom for the labels

  return (
    <Card className="p-5">
      <SectionTitle icon={Clock} title="Hours by month">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {span === "custom" && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
              <input type="month" aria-label="From" value={customFrom} max={customTo} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
              to
              <input type="month" aria-label="To" value={customTo} min={customFrom} onChange={(e) => e.target.value && setCustomTo(e.target.value)} className={cx(inputClass, "!h-9 w-auto")} />
            </span>
          )}
          <Segmented label="Months" value={span} onChange={setSpan} options={SPANS} size="sm" />
        </div>
      </SectionTitle>

      <div key={`${span}-${customFrom}-${customTo}`} className="flex h-48 items-end gap-3 border-b border-stone-200 sm:gap-6">
        {months.map((m, i) => {
          const current = m.start === thisMonth;
          return (
            <button
              key={m.start}
              type="button"
              onClick={() => onPick(m.start, Math.min(m.end, startOfDay(now) + DAY) - DAY)}
              aria-label={`${formatDate(m.start, { month: "long", year: "numeric" })}: ${formatHours(m.secs)}`}
              className="group relative h-full min-w-0 flex-1 outline-none"
            >
              <span
                className={cx(
                  "absolute inset-x-0 bottom-0 mx-auto w-full max-w-16 origin-bottom animate-grow-y rounded-t-md transition group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-brand-300",
                  current ? "bg-brand-300" : "bg-brand-500",
                )}
                style={{ height: m.secs ? `${Math.max(2, (m.secs / top) * 100)}%` : "2px", animationDelay: `${i * 60}ms` }}
              />
              <span className="absolute inset-x-0 text-center text-sm font-extrabold text-stone-800 tabular-nums" style={{ bottom: `calc(${(m.secs / top) * 100}% + 4px)` }}>
                {formatHours(m.secs)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 sm:gap-6">
        {months.map((m) => (
          <span key={m.start} className={cx("min-w-0 flex-1 truncate text-center text-xs font-bold", m.start === thisMonth ? "text-brand-600" : "text-stone-500")}>
            {formatDate(m.start, { month: "short", ...(months.length > 1 && new Date(m.start).getMonth() === 0 && { year: "numeric" }) })}
          </span>
        ))}
      </div>
    </Card>
  );
}
