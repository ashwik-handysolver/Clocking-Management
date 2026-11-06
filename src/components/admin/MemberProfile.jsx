import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BadgeDollarSign, Briefcase, Calendar, Camera, ChevronLeft, ChevronRight, Clock, Copy, Crown, ListTodo, Mail,
  Pencil, PencilLine, Plus, RotateCcw, Settings2, Timer, Trash, TriangleAlert, UserMinus, UserRound,
} from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { navigate, openItem } from "../../lib/router";
import {
  DAY, addDays, dueInfo, formatDate, formatHours, formatTime, fromDateKey, startOfDay, startOfWeek, timeAgo, toDateKey, todayKey,
} from "../../lib/time";
import { ancestry, assigneesOf, entryBilling, entrySeconds, isDone, isOverdue, pathLabel } from "../../store/model";
import { listSnapshots, snapshotUrls } from "../../store/db";
import { useStore } from "../../store/store";
import AddWizard from "../AddSubtaskWizard";
import { Legend, SERIES, StackedBars } from "../charts";
import { useDialogs } from "../dialogs";
import { DoneName, useReveal } from "../motion";
import { Avatar, Button, Card, EmptyState, IconChip, Modal, Popover, Select, StatusIcon, cx, inputClass } from "../ui";
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
const DAYS_SHOWN = 14; // the day-by-day chart

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
  const [pickedDay, setPickedDay] = useState(null); // a day picked on the chart (its start time)
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
  const billable = secondsBetween(inRange.filter((e) => entryBilling(index, e) === "billable"), from, until, now);
  const sessions = inRange.length;
  const daysWorked = new Set(inRange.map((e) => new Date(e.start).toDateString())).size;

  // Their subtasks
  const today = todayKey();
  const assigned = items.filter((s) => s.type === "subtask" && assigneesOf(s).includes(memberId));
  const open = assigned.filter((s) => !isDone(s));
  const overdue = open.filter((s) => isOverdue(s, today));
  const completed = assigned.length - open.length;

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

  // Last 14 days, split billable / non-billable
  const firstDay = addDays(startOfDay(now), -(DAYS_SHOWN - 1));
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const s = addDays(firstDay, i);
    const dayEntries = mine.filter((e) => (e.end ?? now) > s && e.start < s + DAY);
    return {
      start: s,
      billable: secondsBetween(dayEntries.filter((e) => entryBilling(index, e) === "billable"), s, s + DAY, now),
      non: secondsBetween(dayEntries.filter((e) => entryBilling(index, e) !== "billable"), s, s + DAY, now),
    };
  });

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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile key={`t-${rangeKey}`} icon={Timer} tone="brand" label="Hours clocked" value={formatHours(total)} sub={`${sessions} clocking${sessions === 1 ? "" : "s"} · ${daysWorked} day${daysWorked === 1 ? "" : "s"}`} />
            <StatTile
              key={`b-${rangeKey}`}
              icon={BadgeDollarSign}
              tone="violet"
              label="Billable"
              value={formatHours(billable)}
              sub={total ? `${Math.round((billable / total) * 100)}% of their time` : "No time yet"}
            />
            <StatTile key={`a-${rangeKey}`} icon={Clock} tone="sky" label="Average per day worked" value={formatHours(daysWorked ? total / daysWorked : 0)} sub="On days they clocked in" />
            <StatTile
              key="o"
              icon={overdue.length ? TriangleAlert : ListTodo}
              tone={overdue.length ? "red" : "emerald"}
              label="Open subtasks"
              value={String(open.length)}
              sub={overdue.length ? `${overdue.length} overdue · ${completed} completed` : `${completed} completed`}
            />
          </div>
        </div>

        {/* Last 14 days, and where the time went */}
        <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <DayChart days={days} onPick={setPickedDay} />
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

      {pickedDay != null && <DayDetail member={member} dayStart={pickedDay} entries={mine} onClose={() => setPickedDay(null)} />}
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

/** One day of someone's work: their clockings, and the screenshots from that day. */
function DayDetail({ member, dayStart, entries, onClose }) {
  const { allIndex: index } = useStore();
  const [shots, setShots] = useState(null);
  const [urls, setUrls] = useState(new Map());
  const dayEnd = dayStart + DAY;
  const dayEntries = entries.filter((e) => (e.end ?? Date.now()) > dayStart && e.start < dayEnd).sort((a, b) => a.start - b.start);
  const total = secondsBetween(dayEntries, dayStart, dayEnd, Date.now());

  useEffect(() => {
    let alive = true;
    listSnapshots({ memberId: member.id, from: dayStart, to: dayEnd, limit: 8 })
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
  }, [member.id, dayStart, dayEnd]);

  return (
    <Modal
      title={formatDate(dayStart, { weekday: "long", day: "numeric", month: "long" })}
      subtitle={`${member.name} · ${formatHours(total)} clocked`}
      icon={Calendar}
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="primary" icon={Camera} onClick={() => navigate("screenshots", null, { member: member.id, date: toDateKey(dayStart) })}>
          All screenshots from this day
        </Button>
      }
    >
      <p className="mb-2 text-xs font-extrabold tracking-widest text-stone-400 uppercase">Clockings</p>
      {dayEntries.length ? (
        <ul className="mb-5 divide-y divide-stone-100 rounded-2xl bg-stone-50 px-3">
          {dayEntries.map((e) => {
            const sub = index.get(e.subtaskId);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (sub) openItem(sub.id);
                  }}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="w-28 shrink-0 text-xs font-semibold text-stone-500 tabular-nums">
                    {formatTime(e.start)}–{e.end ? formatTime(e.end) : "now"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-800">{sub?.name ?? "Deleted subtask"}</span>
                    <span className="block truncate text-xs text-stone-400">{sub ? pathLabel(index, sub.id).replaceAll(" / ", " › ") : ""}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-stone-900 tabular-nums">{formatHours(entrySeconds(e))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-5 rounded-2xl bg-stone-50 py-6 text-center text-sm text-stone-400">No clockings on this day.</p>
      )}

      <p className="mb-2 text-xs font-extrabold tracking-widest text-stone-400 uppercase">Screenshots</p>
      {shots && !shots.length ? (
        <p className="rounded-2xl bg-stone-50 py-6 text-center text-sm text-stone-400">No screenshots on this day.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(shots ?? [0, 1, 2, 3]).map((s, i) => (
            <li key={s?.id ?? i} className="overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-900/5">
              <span className={cx("relative block aspect-video bg-stone-200/70", !s && "animate-skeleton")}>
                {s && urls.get(s.path) && <img src={urls.get(s.path)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
              </span>
              {s && <span className="block px-2 py-1 text-[11px] font-semibold text-stone-500">{formatTime(s.takenAt)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Hours per day for the last 14 days, billable and non-billable stacked. Click a day for its details. */
function DayChart({ days, onPick }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...days.map((d) => d.billable + d.non), 4 * 3600);
  const total = days.reduce((s, d) => s + d.billable + d.non, 0);
  const todayStart = startOfDay(Date.now());
  return (
    <Card className="p-5">
      <SectionTitle icon={Clock} title="Last 14 days">
        <span className="text-sm text-stone-500">
          <span className="font-extrabold text-stone-900">{formatHours(total)}</span> in total
        </span>
      </SectionTitle>
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 border-t border-dashed border-stone-200" />
        <div className="flex h-40 items-end gap-1.5" onMouseLeave={() => setHover(null)}>
          {days.map((d, i) => {
            const secs = d.billable + d.non;
            const weekend = [0, 6].includes(new Date(d.start).getDay());
            return (
              <div
                role="button"
                onClick={() => onPick(d.start)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(d.start))}
                key={d.start}
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${formatDate(d.start, { weekday: "short", day: "numeric", month: "short" })}: ${formatHours(secs)}`}
                className="relative flex h-full flex-1 cursor-pointer flex-col items-center justify-end rounded-t-md outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                {hover === i && (
                  <span className="palette-fixed absolute -top-10 z-10 rounded-lg bg-stone-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-float">
                    <b>{formatDate(d.start, { weekday: "short", day: "numeric", month: "short" })}</b> · {formatHours(secs)}
                    {d.non > 0 && <span className="text-white/70"> ({formatHours(d.non)} non-billable)</span>}
                  </span>
                )}
                {secs ? (
                  <div
                    className="flex w-full max-w-7 origin-bottom animate-grow-y flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                    style={{ height: `${Math.max(4, (secs / max) * 100)}%`, animationDelay: `${i * 30}ms` }}
                  >
                    {d.billable > 0 && <div className={SERIES[0].swatch} style={{ height: `${(d.billable / secs) * 100}%` }} />}
                    {d.non > 0 && <div className={SERIES[1].swatch} style={{ height: `${(d.non / secs) * 100}%` }} />}
                  </div>
                ) : (
                  <div className={cx("h-[2px] w-full max-w-7", weekend ? "bg-stone-100" : "bg-stone-200")} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5 border-t border-stone-200 pt-2">
          {days.map((d) => (
            <span key={d.start} className={cx("flex-1 text-center text-[10px] font-bold", d.start === todayStart ? "text-brand-600" : "text-stone-400")}>
              {new Date(d.start).getDate()}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <Legend />
      </div>
    </Card>
  );
}
