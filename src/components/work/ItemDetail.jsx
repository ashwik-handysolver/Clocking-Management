import { useMemo } from "react";
import {
  Archive, ArrowLeft, CalendarCheck, Camera, CircleCheck, ListChecks, Mail, Pencil, Plus, Timer, Trash, TriangleAlert, UserRound,
} from "lucide-react";
import { navigate, openItem } from "../../lib/router";
import { formatHours, todayKey } from "../../lib/time";
import {
  CHILD_TYPE, TYPE_LABEL, ancestry, assigneesOf, descendants, isDone, isOverdue, isWork, progressOf, rollupSeconds,
} from "../../store/model";
import { canArchive, canCreate, canDeleteItem, canEditDetails, isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { TYPE_ICON } from "../ItemForm";
import { AvatarStack, Button, Card, IconChip, ProgressRing, TONE, Watermark, cx } from "../ui";
import ChildrenList from "./ChildrenList";
import ClientWork from "./ClientWork";
import ClockCard from "./ClockCard";
import WorkProperties, { Prop } from "./WorkProperties";
import { useDeleteItem } from "./useDeleteItem";

function Stat({ icon, color = "brand", label, value, sub, valueClass, aside }) {
  return (
    <div className={cx("relative overflow-hidden rounded-2xl bg-gradient-to-br p-3.5 ring-1 ring-stone-900/5", TONE[color].bg)}>
      <Watermark icon={icon} tone={color} className="!-right-3 !-bottom-5 !size-20" />
      <div className="relative flex items-center gap-3">
        <IconChip icon={icon} tone={color} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wide text-stone-400 uppercase">{label}</p>
          <p className={cx("text-xl leading-tight font-extrabold tracking-tight text-stone-900", valueClass)}>{value}</p>
          {sub && <div className="truncate text-xs text-stone-500">{sub}</div>}
        </div>
        {aside}
      </div>
    </div>
  );
}

/** Roll-up numbers for a client, project or task. */
function Summary({ item, seconds }) {
  const { index, memberById, me } = useStore();
  const work = descendants(index, item.id).slice(1).filter(isWork);
  const prog = progressOf(index, item.id);
  // Same units as Progress: subtasks, plus tasks that have no subtasks.
  const open = prog.total - prog.done;
  const today = todayKey();
  const overdue = work.filter((x) => isOverdue(x, today)).length;
  // On a task, "your time" covers only the subtasks assigned to you, measured against their estimates.
  const mySubtasks = item.type === "task" ? work.filter((x) => x.type === "subtask" && assigneesOf(x).includes(me.id)) : [];
  const logged = item.type === "task" ? mySubtasks.reduce((s, x) => s + (seconds.get(x.id) ?? 0), 0) : seconds.get(item.id) ?? 0;
  const estimate = mySubtasks.reduce((s, x) => s + (x.estimate ?? 0), 0);
  // People = assignees only; who clocked time is private.
  const people = [...new Set(work.flatMap(assigneesOf))]
    .map((id) => memberById.get(id))
    .filter(Boolean);

  return (
    <div className="space-y-2">
      {item.type === "task" && <WorkProperties item={item} />}
      {item.type === "client" && (
        <dl className="grid grid-cols-1 gap-2 rounded-3xl bg-stone-50 p-2 @md:grid-cols-2">
          <Prop icon={UserRound} label="Contact person">{item.contactName || <span className="text-stone-400">Not set</span>}</Prop>
          <Prop icon={Mail} label="Email">
            {item.contactEmail ? (
              <a href={`mailto:${item.contactEmail}`} className="block truncate text-brand-700 hover:underline">
                {item.contactEmail}
              </a>
            ) : (
              <span className="text-stone-400">Not set</span>
            )}
          </Prop>
        </dl>
      )}

      <div className="grid grid-cols-1 gap-2 rounded-3xl bg-stone-50 p-2 @md:grid-cols-2 @4xl:grid-cols-4">
        <Stat icon={CircleCheck} color="emerald" label="Progress" value={`${prog.done}/${prog.total}`} sub="items completed" aside={<ProgressRing value={prog.pct} tone="green" />} />
        <Stat icon={ListChecks} color="amber" label="Open" value={open} sub={`of ${prog.total} items`} />
        <Stat
          icon={overdue ? TriangleAlert : CalendarCheck}
          color={overdue ? "red" : "sky"}
          label="Overdue"
          value={overdue}
          valueClass={overdue ? "!text-red-600" : undefined}
          sub={overdue ? "Needs attention" : "All on track"}
        />
        <Stat
          icon={Timer}
          color="brand"
          label="Your time"
          value={formatHours(logged)}
          sub={estimate ? `of ${estimate}h estimated for you` : item.type === "task" ? "No subtasks assigned to you" : people.length ? `${people.length} people assigned` : "No time yet"}
          aside={!estimate && people.length ? <AvatarStack members={people} max={3} /> : estimate ? <ProgressRing value={(logged / (estimate * 3600)) * 100} tone={logged > estimate * 3600 ? "red" : "brand"} /> : null}
        />
      </div>
    </div>
  );
}

/**
 * Full page for one item. Clients show their projects as tabs (`projectId` picks a tab);
 * tasks list their subtasks as rows that expand in place.
 */
export default function ItemDetail({ item, projectId = null, billing = "billable" }) {
  const { entries, teamEntries, index, actions, me } = useStore();
  const { openItemForm, confirm, toast } = useDialogs();
  // Work with logged time can't be deleted by team members (the database checks everyone's time).
  const hasTime = useMemo(() => {
    const ids = new Set(descendants(index, item.id).map((x) => x.id));
    return teamEntries.some((e) => ids.has(e.subtaskId));
  }, [index, item.id, teamEntries]);
  const isClient = item.type === "client";
  // A client page adds tasks (into the open project tab); projects are added from the tabs.
  const addType = isClient ? "task" : CHILD_TYPE[item.type];

  // Your own time only (store/permissions.js).
  const seconds = useMemo(() => rollupSeconds(index, entries), [index, entries]);
  const Icon = TYPE_ICON[item.type];
  const parent = item.parentId ? index.get(item.parentId) : null;
  const childCount = index.childrenOf(item.id).length;

  const archive = () =>
    confirm({
      title: `Archive ${TYPE_LABEL[item.type].toLowerCase()}?`,
      message: `“${item.name}” and everything in it will be hidden from the team. Its time stays in timesheets and invoices. Restore it any time from Archive.`,
      confirmLabel: "Archive",
      onConfirm: () => {
        actions.archiveItem(item.id);
        item.parentId ? openItem(item.parentId) : navigate("work");
        toast(`${TYPE_LABEL[item.type]} archived`);
      },
    });

  // Warns with the clockings and screenshots that go too.
  const askDelete = useDeleteItem();
  const remove = () => askDelete(item, { after: () => (item.parentId ? openItem(item.parentId) : navigate("work")) });

  return (
    // @container: everything inside lays out by this view's width, not the screen's.
    <div className="@container space-y-4">
      <Card className="relative overflow-hidden p-2">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-br from-brand-50 via-brand-50/40 to-transparent" />
        <div className="pointer-events-none absolute -top-16 -right-12 size-56 rounded-full bg-brand-100/50" />
        <Icon aria-hidden="true" strokeWidth={1.25} className="pointer-events-none absolute top-4 right-6 size-40 rotate-[-10deg] text-brand-500/[0.06]" />
        <div className="relative px-4 pt-4 pb-5 @md:px-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon={ArrowLeft}
                onClick={() => (parent ? openItem(parent.id) : navigate("work"))}
                className={item.type === "subtask" ? undefined : "lg:hidden"}
              >
                {item.type === "subtask" ? "Task" : "Back"}
              </Button>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-brand-700 uppercase">
                <Icon className="size-3.5" />
                {TYPE_LABEL[item.type]}
              </span>
              {parent && (
                <button type="button" onClick={() => openItem(parent.id)} className="hidden min-w-0 truncate text-xs font-medium text-stone-400 hover:text-stone-700 @lg:block">
                  in {ancestry(index, parent.id).map((a) => a.name).join(" / ")}
                </button>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              {/* This task's (or subtask's) screenshots: everyone's for the admin, your own for team members. */}
              {(item.type === "task" || item.type === "subtask") && (
                <Button size="sm" variant="soft" icon={Camera} onClick={() => navigate("screenshots", null, { [item.type]: item.id })}>
                  View screenshots
                </Button>
              )}
              {/* Clients and projects are managed by the admin, who archives them instead of deleting. */}
              {canCreate(me, item.type) && canEditDetails(me, item) && (
                <Button size="sm" icon={Pencil} onClick={() => openItemForm({ id: item.id })}>
                  Edit
                </Button>
              )}
              {canArchive(me, item) ? (
                <Button size="sm" variant="ghost" icon={Archive} onClick={archive} title="Hide this client and keep its time">
                  Archive
                </Button>
              ) : (
                canDeleteItem(me, item, hasTime) && <Button size="sm" variant="dangerGhost" iconOnly icon={Trash} aria-label="Delete" title="Delete" onClick={remove} />
              )}
            </div>
          </div>

          <div className="flex flex-col items-start gap-4 @xl:flex-row @xl:items-end @xl:justify-between">
            <div className="min-w-0">
              <h1 className={cx("text-[28px] leading-tight font-extrabold tracking-tight break-words text-stone-900", isDone(item) && "text-stone-400 line-through decoration-2")}>
                {item.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed whitespace-pre-wrap text-stone-500">{item.description || "No description yet."}</p>
            </div>
            {/* Subtasks are added from the header or the last row of the list, so no button here. */}
            {addType && addType !== "subtask" && (
              <Button variant="primary" icon={Plus} onClick={() => openItemForm({ type: addType, contextId: projectId ?? item.id, lockType: true, ...(isClient && { billing }) })}>
                Add {TYPE_LABEL[addType].toLowerCase()}
              </Button>
            )}
          </div>
        </div>

        <div className="relative">{item.type === "subtask" ? <WorkProperties item={item} /> : <Summary item={item} seconds={seconds} />}</div>
      </Card>

      {item.type === "subtask" && <ClockCard subtask={item} />}

      {isClient && <ClientWork client={item} projectId={projectId} billing={billing} seconds={seconds} />}

      {item.type === "task" && (
        <Card className="p-4 @md:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold tracking-tight text-stone-900">
            Subtasks
            <span className="rounded-full bg-brand-50 px-2 py-px text-xs font-bold text-brand-700">{childCount}</span>
          </h2>
          <ChildrenList item={item} seconds={seconds} />
        </Card>
      )}
    </div>
  );
}

