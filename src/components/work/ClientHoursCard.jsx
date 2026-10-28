import { useMemo, useState } from "react";
import { CalendarClock, CalendarOff, ChevronDown, ExternalLink, Gauge, History, Plus, Users } from "lucide-react";
import { openItem } from "../../lib/router";
import { formatHours, shortDate, todayKey } from "../../lib/time";
import { byUrgency, cycleStats } from "../../store/clientHours";
import { ancestry, clientCycle, descendants } from "../../store/model";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Avatar, AvatarStack, Button, Card, IconChip, cx } from "../ui";
import HolidaysDialog from "./HolidaysDialog";

/*
 * Client hours (admin dashboard): each client's current billing cycle as an accordion.
 * The collapsed row shows name, status and a progress bar; opening it shows pace, hours needed
 * per day (and per person on the client's team), today's progress, who worked and the last cycle.
 * Only billable time counts. Most urgent clients first, and the most urgent starts open.
 */

const SHOWN = 5;

const STATUS = {
  over: { label: "Over", pill: "bg-red-100 text-red-700", bar: "from-red-400 to-red-600", dot: "bg-red-500" },
  behind: { label: "Behind", pill: "bg-amber-100 text-amber-800", bar: "from-amber-300 to-amber-500", dot: "bg-amber-500" },
  "on-track": { label: "On track", pill: "bg-emerald-100 text-emerald-700", bar: "from-brand-400 to-brand-600", dot: "bg-emerald-500" },
  ahead: { label: "Ahead", pill: "bg-sky-100 text-sky-700", bar: "from-brand-400 to-brand-600", dot: "bg-sky-500" },
  upcoming: { label: "Not started", pill: "bg-stone-100 text-stone-600", bar: "from-stone-300 to-stone-400", dot: "bg-stone-400" },
};

export default function ClientHoursCard({ entries, now, className }) {
  const { allIndex: index, state, memberById } = useStore();
  const { openItemForm } = useDialogs();
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState(undefined); // undefined = the most urgent client starts open
  const [editingHolidays, setEditingHolidays] = useState(false);
  const today = todayKey();
  const holidays = useMemo(() => new Set((state.holidays ?? []).map((h) => h.day)), [state.holidays]);

  const entriesByClient = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const client = ancestry(index, e.subtaskId).find((x) => x.type === "client");
      if (!client) continue;
      if (!map.has(client.id)) map.set(client.id, []);
      map.get(client.id).push(e);
    }
    return map;
  }, [entries, index]);

  const rows = state.items
    .filter((i) => i.type === "client" && !i.archived)
    .map((client) => ({ client, cycle: clientCycle(client, today) }))
    .filter((r) => r.cycle)
    .map((r) => {
      const stats = cycleStats({ cycle: r.cycle, entries: entriesByClient.get(r.client.id) ?? [], index, holidays, now, today });
      // The client's team: everyone assigned to its subtasks, plus anyone who logged billable time this cycle.
      const ids = new Set(stats.byMember.keys());
      for (const s of descendants(index, r.client.id)) if (s.type === "subtask") (s.assignees ?? []).forEach((id) => ids.add(id));
      const team = [...ids].map((id) => memberById.get(id)).filter((m) => m && !m.isAdmin);
      return { ...r, stats, team };
    })
    .sort(byUrgency);
  const visible = all ? rows : rows.slice(0, SHOWN);
  const open = openId === undefined ? rows[0]?.client.id : openId;
  const needsLook = rows.filter((r) => r.stats.status === "over" || r.stats.status === "behind").length;

  return (
    <Card className={cx("relative flex flex-col overflow-hidden p-5", className)}>
      <div className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_220_196/0.55),transparent)]" />
      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-stone-900">
          <IconChip icon={Gauge} tone="brand" size="sm" />
          Client hours
          {needsLook > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{needsLook} need a look</span>}
        </h2>
        <Button size="xs" variant="soft" icon={CalendarOff} onClick={() => setEditingHolidays(true)}>
          Holidays{holidays.size ? ` (${holidays.size})` : ""}
        </Button>
      </div>

      {!rows.length ? (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <p className="text-sm font-bold text-stone-700">No client has hours set yet</p>
          <Button size="sm" variant="soft" icon={Plus} onClick={() => openItemForm({ type: "client", lockType: true })}>
            Add a client with hours
          </Button>
        </div>
      ) : (
        <>
          <ul className="relative space-y-2">
            {visible.map((r) => (
              <ClientItem key={r.client.id} {...r} open={open === r.client.id} onToggle={() => setOpenId(open === r.client.id ? null : r.client.id)} />
            ))}
          </ul>
          {rows.length > SHOWN && (
            <div className="relative mt-3 flex justify-center">
              <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${rows.length} clients`}
              </Button>
            </div>
          )}
          <p className="relative mt-auto pt-3 text-[11px] font-semibold text-stone-400">Billable hours only · working days are Mon–Fri minus holidays</p>
        </>
      )}

      {editingHolidays && <HolidaysDialog onClose={() => setEditingHolidays(false)} />}
    </Card>
  );
}

function ClientItem({ client, cycle, stats: s, team, open, onToggle }) {
  const { memberById } = useStore();
  const st = STATUS[s.status];
  const over = s.status === "over";
  const paceText = over
    ? `Over by ${formatHours(s.used - s.budget)}`
    : s.status === "upcoming"
      ? `Starts ${shortDate(cycle.start)}`
      : Math.abs(s.pace) < 60
        ? "Exactly on pace"
        : `${s.pace < 0 ? "Behind" : "Ahead"} by ${formatHours(Math.abs(s.pace))}`;
  const todayPct = s.neededPerDay ? Math.min(100, (s.todayUsed / s.neededPerDay) * 100) : 0;
  const people = [...s.byMember.entries()].sort((a, b) => b[1] - a[1]);
  const perPerson = team.length ? s.neededPerDay / team.length : s.neededPerDay;
  const panelId = `client-hours-${client.id}`;

  return (
    <li className={cx("overflow-hidden rounded-2xl ring-1 transition", open ? "bg-gradient-to-br from-brand-50/70 to-surface ring-brand-200" : "bg-stone-50/80 ring-stone-900/5 hover:ring-brand-200")}>
      {/* Summary row */}
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className={cx("size-2.5 shrink-0 rounded-full", st.dot)} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-extrabold text-stone-900">{client.name}</span>
            <span className="shrink-0 text-xs font-bold text-stone-500 tabular-nums">
              <span className="text-stone-900">{formatHours(s.used)}</span> / {cycle.hours}h
            </span>
          </span>
          <span className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-stone-200/80">
            <span className={cx("block h-full rounded-full bg-gradient-to-r", st.bar)} style={{ width: `${Math.min(100, s.pct)}%` }} />
          </span>
        </span>
        <span className={cx("hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold sm:inline", st.pill)}>{st.label}</span>
        <ChevronDown className={cx("size-4 shrink-0 text-stone-400 transition-transform", open && "rotate-180")} />
      </button>

      {/* Details */}
      {open && (
        <div id={panelId} className="animate-fade-in space-y-3 px-3.5 pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1 text-stone-500">
              <CalendarClock className="size-3.5" />
              {shortDate(cycle.start)} – {shortDate(cycle.end)}
              {s.endingSoon && (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
                  Ends in {s.daysLeft} working {s.daysLeft === 1 ? "day" : "days"}
                </span>
              )}
            </span>
            <span className={cx("font-bold", over ? "text-red-600" : s.status === "behind" ? "text-amber-700" : "text-stone-600")}>{paceText}</span>
          </div>

          {/* progress vs where it should be */}
          <div className="relative h-2.5 overflow-hidden rounded-full bg-stone-200/70">
            <div className={cx("h-full rounded-full bg-gradient-to-r transition-all duration-700", st.bar)} style={{ width: `${Math.min(100, s.pct)}%` }} />
            {s.status !== "upcoming" && s.totalDays > 0 && (
              <span className="absolute top-0 h-full w-0.5 bg-stone-900/40" style={{ left: `${Math.min(100, (s.expected / s.budget) * 100)}%` }} title="Where usage should be by now" />
            )}
          </div>
          {s.nonBillableUsed > 0 && <p className="-mt-1.5 text-[11px] font-semibold text-stone-400">+{formatHours(s.nonBillableUsed)} non-billable, not counted</p>}

          <dl className="grid grid-cols-2 gap-2">
            <Stat label={over ? "Over by" : "Hours left"} value={formatHours(over ? s.used - s.budget : s.left)} danger={over} />
            <Stat label="Working days left" value={s.daysLeft} sub={`of ${s.totalDays}`} />
            <Stat label="Needed per day" value={s.left ? formatHours(s.neededPerDay) : "—"} sub={s.left ? `${formatHours(s.neededPerWeek)} per week` : "All used"} />
            <Stat
              label="Per person / day"
              value={s.left ? formatHours(perPerson) : "—"}
              sub={team.length ? `${team.length} ${team.length === 1 ? "person" : "people"}` : "No one assigned"}
              strong
            />
          </dl>

          {s.status !== "upcoming" && (
            <div className="rounded-xl bg-surface px-3 py-2.5 ring-1 ring-stone-900/5">
              {s.todayIsWorkday ? (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-bold text-stone-700">Today</span>
                    <span className="font-semibold text-stone-500 tabular-nums">
                      <span className="font-extrabold text-stone-900">{formatHours(s.todayUsed)}</span>
                      {s.neededPerDay > 0 && ` of ${formatHours(s.neededPerDay)} needed`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div className={cx("h-full rounded-full transition-all", todayPct >= 100 ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${todayPct}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-xs font-semibold text-stone-500">Today is a day off · {formatHours(s.todayUsed)} logged</p>
              )}
            </div>
          )}

          {/* who worked */}
          <div className="rounded-xl bg-surface px-3 py-2.5 ring-1 ring-stone-900/5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                <Users className="size-3.5 text-brand-500" /> Who worked this cycle
              </span>
              {team.length > 0 && <AvatarStack members={team} max={4} size="xs" />}
            </div>
            {people.length ? (
              <ul className="space-y-1.5">
                {people.map(([id, secs]) => {
                  const m = memberById.get(id);
                  return (
                    <li key={id} className="flex items-center gap-2 text-xs">
                      <Avatar member={m} size="xs" />
                      <span className="w-20 truncate font-semibold text-stone-700">{m?.name.split(" ")[0] ?? "Someone"}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <span className="block h-full rounded-full bg-brand-400" style={{ width: `${(secs / s.used) * 100}%` }} />
                      </span>
                      <span className="w-14 text-right font-bold text-stone-900 tabular-nums">{formatHours(secs)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-stone-400">No billable time yet</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1 font-semibold text-stone-500">
              <History className="size-3.5" />
              {s.prevUsed == null ? "First cycle" : `Last cycle: ${formatHours(s.prevUsed)} of ${cycle.hours}h`}
            </span>
            <button type="button" onClick={() => openItem(client.id)} className="flex items-center gap-1 rounded-full px-2 py-1 font-bold text-brand-700 hover:bg-brand-50">
              Open client <ExternalLink className="size-3" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, sub, danger, strong }) {
  return (
    <div className={cx("rounded-xl px-2.5 py-2", strong ? "palette-fixed bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-glow" : "bg-surface ring-1 ring-stone-900/5")}>
      <dt className={cx("text-[10px] font-bold tracking-wide uppercase", strong ? "text-white/80" : "text-stone-400")}>{label}</dt>
      <dd className={cx("text-base font-extrabold tabular-nums", strong ? "text-white" : danger ? "text-red-600" : "text-stone-900")}>{value}</dd>
      {sub && <dd className={cx("truncate text-[10px] font-semibold", strong ? "text-white/80" : "text-stone-400")}>{sub}</dd>}
    </div>
  );
}
