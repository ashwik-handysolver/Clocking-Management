import { useMemo, useState } from "react";
import { CircleCheck, ListTodo, Search, Timer, TriangleAlert, UserRoundCheck } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { openItem } from "../../lib/router";
import { dueInfo, formatHours, startOfDay } from "../../lib/time";
import { assigneesOf, statusChoices, entrySeconds, isDone, pathLabel, rollupSeconds, runningEntryOf } from "../../store/model";
import { useStore } from "../../store/store";
import { AvatarStack, Card, EmptyState, IconChip, PillSelect, PriorityLabel, STATUS_STYLE, cx } from "../ui";
import { ClockButton } from "./ClockCard";
import { DUE_TONE } from "./WorkProperties";

const PRIORITY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

const GROUPS = [
  { key: "now", label: "Clocked in" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No due date" },
  { key: "done", label: "Completed" },
];

function groupOf(sub, runningId) {
  if (sub.id === runningId) return "now";
  if (isDone(sub)) return "done";
  const { days } = dueInfo(sub.due);
  if (days == null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days < 7) return "week";
  return "later";
}

const VIEWS = [
  { key: "to", label: "Assigned to me" },
  { key: "by", label: "Assigned by me" },
];

/** Home page for everyone: the subtasks assigned to you (with one-click clock-in), or the ones you handed out. */
export default function MyWork() {
  const { items, index, entries, me, actions, memberById } = useStore();
  const [view, setView] = useState("to");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const running = runningEntryOf(entries, me.id);
  const now = useNow(Boolean(running), 30_000);
  const seconds = useMemo(() => rollupSeconds(index, entries), [index, entries]);
  const byMe = view === "by";

  const mine = items.filter(
    (i) => i.type === "subtask" && (byMe ? i.assignedBy === me.id && assigneesOf(i).some((id) => id !== me.id) : assigneesOf(i).includes(me.id)),
  );
  const q = query.trim().toLowerCase();
  const namesOf = (s) => assigneesOf(s).map((id) => memberById.get(id)?.name ?? "").join(" ").toLowerCase();
  const matches = mine.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || pathLabel(index, s.id).toLowerCase().includes(q) || (byMe && namesOf(s).includes(q)),
  );

  const groups = new Map(GROUPS.map((g) => [g.key, []]));
  for (const s of matches) groups.get(groupOf(s, byMe ? null : running?.subtaskId)).push(s);
  for (const list of groups.values())
    list.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)); // no due date → last

  const open = mine.filter((s) => !isDone(s)).length;
  const overdue = mine.filter((s) => !isDone(s) && (dueInfo(s.due).days ?? 0) < 0).length;
  const todayStart = startOfDay(now);
  const today = entries.filter((e) => e.start >= todayStart).reduce((sum, e) => sum + entrySeconds(e, now), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={ListTodo} tone="brand" label={byMe ? "Open, assigned by you" : "Open subtasks"} value={open} />
        <Stat icon={overdue ? TriangleAlert : CircleCheck} tone={overdue ? "red" : "emerald"} label="Overdue" value={overdue} />
        {byMe ? (
          <Stat icon={CircleCheck} tone="violet" label="Completed" value={mine.length - open} />
        ) : (
          <Stat icon={Timer} tone="violet" label="Your time today" value={formatHours(today)} />
        )}
      </div>

      <Card className="@container p-4 @md:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold tracking-tight text-stone-900">My work</h1>
          <div role="tablist" aria-label="Which subtasks" className="flex rounded-full bg-stone-100 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                onClick={() => setView(v.key)}
                className={cx(
                  "h-8 rounded-full px-3.5 text-xs font-bold whitespace-nowrap transition",
                  view === v.key ? "bg-surface text-brand-700 shadow-sm ring-1 ring-stone-900/5" : "text-stone-500 hover:text-stone-800",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={byMe ? "Search by subtask or person…" : "Search your subtasks…"}
              className="h-10 w-full rounded-2xl bg-stone-100 pr-3 pl-10 text-sm outline-none placeholder:text-stone-400 focus:bg-surface focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-500">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-brand-500" />
            Show completed
          </label>
        </div>

        {!mine.length ? (
          byMe ? (
            <EmptyState icon={UserRoundCheck} title="You haven't assigned anything" />
          ) : (
            <EmptyState icon={ListTodo} title="Nothing assigned to you" />
          )
        ) : !matches.length ? (
          <EmptyState icon={Search} title="No matches" />
        ) : (
          <div className="space-y-5">
            {GROUPS.filter((g) => groups.get(g.key).length && (g.key !== "done" || showDone)).map((g) => (
              <section key={g.key}>
                <h2 className={cx("mb-2 flex items-center gap-2 px-1 text-xs font-extrabold tracking-widest uppercase", g.key === "overdue" ? "text-red-500" : "text-stone-400")}>
                  {g.label}
                  <span className="rounded-full bg-stone-100 px-1.5 text-[11px] text-stone-500">{groups.get(g.key).length}</span>
                </h2>
                <ul className="space-y-1.5">
                  {groups.get(g.key).map((s) => (
                    <Row key={s.id} sub={s} byMe={byMe} secs={seconds.get(s.id) ?? 0} onStatus={(status) => actions.updateItem(s.id, { status })} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ sub, byMe, secs, onStatus }) {
  const { index, memberById } = useStore();
  const people = assigneesOf(sub).map((id) => memberById.get(id)).filter(Boolean);
  const due = dueInfo(sub.due, isDone(sub));
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => openItem(sub.id)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && openItem(sub.id)}
      className="group flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-stone-50 p-3 transition hover:bg-brand-50/70 @lg:flex-nowrap"
    >
      {byMe ? (
        <span title={`Assigned to ${people.map((m) => m.name).join(", ")}`}>
          <AvatarStack members={people} max={2} />
        </span>
      ) : (
        <ClockButton subtask={sub} />
      )}
      <div className="min-w-0 flex-1">
        <p className={cx("truncate text-sm font-bold text-stone-800 group-hover:text-brand-700", isDone(sub) && "!text-stone-400 line-through")}>{sub.name}</p>
        <p className="truncate text-xs text-stone-400">
          {byMe && <span className="font-semibold text-stone-500">{people.map((m) => m.name.split(" ")[0]).join(", ")} · </span>}
          {pathLabel(index, sub.id).replaceAll(" / ", " › ")}
        </p>
      </div>
      <div className="ml-12 flex basis-full items-center gap-2.5 text-xs @lg:ml-0 @lg:basis-auto">
        <span className={cx("font-semibold whitespace-nowrap", DUE_TONE[due.tone])}>{due.label}</span>
        {secs > 0 && <span className="whitespace-nowrap text-stone-400">{formatHours(secs)}</span>}
        <PriorityLabel priority={sub.priority} compact />
        <PillSelect label="Status" value={sub.status} options={statusChoices(sub.status)} styleFor={(s) => STATUS_STYLE[s]?.pill} onChange={onStatus} className="ring-1 ring-stone-900/5" />
      </div>
    </li>
  );
}

function Stat({ icon, tone, label, value }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <IconChip icon={icon} tone={tone} />
      <div>
        <p className="text-xs font-semibold text-stone-500">{label}</p>
        <p className="text-2xl font-extrabold tracking-tight text-stone-900">{value}</p>
      </div>
    </Card>
  );
}
