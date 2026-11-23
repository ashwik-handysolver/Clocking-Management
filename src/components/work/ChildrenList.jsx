import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { openItem } from "../../lib/router";
import { dueInfo, formatHours } from "../../lib/time";
import { BILLING_LABEL, CHILD_TYPE, billingOf, statusChoices, TYPE_LABEL, assigneesOf, hasAssignee, isDone, isWork, progressOf } from "../../store/model";
import { canChangeStatus } from "../../store/permissions";
import { useStore } from "../../store/store";
import { Segmented } from "../admin/AdminPage";
import { useDialogs } from "../dialogs";
import { TYPE_ICON } from "../ItemForm";
import { Avatar, AvatarStack, EmptyState, PillSelect, ProgressRing, STATUS_STYLE, StatusIcon, ADD_HINT, cx } from "../ui";
import { DoneName, DonePop } from "../motion";
import { ClockButton } from "./ClockCard";
import ItemMenu, { useWorkActions } from "./ItemMenu";

const DUE_TONE = { danger: "text-red-600 font-bold", warning: "text-amber-600 font-semibold", default: "text-stone-500", muted: "text-stone-400" };

export default function ChildrenList({ item, billing, seconds, focusId = null, heading = null }) {
  const [flashId, setFlashId] = useState(focusId); // a subtask opened by link, briefly highlighted
  const { index, actions, memberById, me } = useStore();
  const childType = CHILD_TYPE[item.type];
  // A task's subtasks are split into two tabs: ones you assigned and ones assigned to you.
  const [who, setWho] = useState("to");
  const { toast } = useDialogs();
  const subtasks = childType === "subtask";
  // A project's tasks are shown one billing category at a time (when `billing` is given).
  const byBilling = billing && childType === "task";
  const all = index.childrenOf(item.id).filter((c) => !byBilling || billingOf(index, c.id) === billing);
  // Completed subtasks live in their own tab; the other tabs show open work only.
  const doneCount = subtasks ? all.filter(isDone).length : 0;
  const children = all.filter(
    (c) =>
      !subtasks ||
      (who === "done"
        ? isDone(c)
        : !isDone(c) && (who === "all" || (who === "by" ? c.assignedBy === me.id : (c.assignees ?? []).includes(me.id)))),
  );
  // A subtask opened by link (#/work/<subtask>): show a tab that contains it, scroll to it, highlight it.
  useEffect(() => {
    const sub = focusId && index.get(focusId);
    if (!sub || sub.parentId !== item.id) return;
    setFlashId(focusId);
    const off = setTimeout(() => setFlashId(null), 2400);
    setWho(isDone(sub) ? "done" : (sub.assignees ?? []).includes(me.id) ? "to" : sub.assignedBy === me.id ? "by" : "all");
    const t = setTimeout(() => document.querySelector(`[data-item-id="${focusId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    return () => (clearTimeout(t), clearTimeout(off));
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heading, tabs and Add subtask share one line.
  const tabs = subtasks && (
    <div className="flex flex-wrap items-center gap-2">
    {heading}
    <Segmented
      label="Subtasks"
      value={who}
      onChange={setWho}
      options={[
        ["to", "Assigned to me"],
        ["by", "Assigned by me"],
        ["all", "All"],
        ["done", doneCount ? `Completed (${doneCount})` : "Completed"],
      ]}
    />
    </div>
  );
  const label = (byBilling ? `${BILLING_LABEL[billing].toLowerCase()} ` : "") + TYPE_LABEL[childType].toLowerCase();

  if (!children.length) {
    return (
      <div className="space-y-3">
      {tabs}
      <EmptyState
        icon={TYPE_ICON[childType]}
        title={
          subtasks
            ? who === "done"
              ? "No completed subtasks yet"
              : who === "all"
                ? "No open subtasks"
                : who === "by"
                  ? "No open subtasks assigned by you"
                  : "No open subtasks assigned to you"
            : `No ${label}s yet`
        }
        text={who === "done" && subtasks ? undefined : ADD_HINT}
        className="!py-6"
      />
      </div>
    );
  }

  return (
    <div key={who} className="stagger"> {/* switching tabs: rows fade up again */}
      {tabs && <div className="pb-3">{tabs}</div>}
      {/* Plain rows divided by hairlines; an opened subtask gets a faint background, not a box */}
      <div className="divide-y divide-stone-100">
      {children.map((c) => {
        const work = isWork(c);
        const prog = progressOf(index, c.id);
        const due = work ? dueInfo(c.due, isDone(c)) : null;
        // A subtask you're not on shows none of your time.
        const secs = c.type === "subtask" && !assigneesOf(c).includes(me.id) ? 0 : seconds.get(c.id) ?? 0;
        // Subtasks open in place; projects and tasks go to their own page.
        const inline = c.type === "subtask";
        const activate = () => !inline && openItem(c.id);
        return (
          <div key={c.id} data-item-id={c.id} className={cx("transition-colors duration-700", flashId === c.id && "bg-brand-50")}>
          <div
            {...(!inline && { role: "button", tabIndex: 0, onClick: activate, onKeyDown: (e) => e.key === "Enter" && e.target === e.currentTarget && activate() })}
            className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-2.5 transition-colors hover:bg-stone-50 @lg:flex-nowrap", !inline && "cursor-pointer")}
          >
            {c.type === "subtask" ? (
              <ClockButton subtask={c} />
            ) : c.type === "task" ? (
              <span className="grid size-9 shrink-0 place-items-center">
                <StatusIcon status={c.status} className="size-[18px]" />
              </span>
            ) : (
              <span className="grid size-9 shrink-0 place-items-center text-stone-400">
                <Folder className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className={cx("truncate text-sm font-bold text-stone-800", isDone(c) && "!text-stone-400")}>
                <DoneName item={c}>{c.name}</DoneName>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-stone-400">
                {work ? (
                  <>
                    {c.due && <span className={DUE_TONE[due.tone]}>{due.label}</span>}
                    {c.type === "task" && prog.total > 0 && <span>{c.due && "· "}{prog.done}/{prog.total} subtasks</span>}
                  </>
                ) : (
                  <span>
                    {index.childrenOf(c.id).length} {TYPE_LABEL[CHILD_TYPE[c.type]].toLowerCase()}s · {prog.done}/{prog.total} done
                  </span>
                )}
                {secs > 0 && <span>{(c.due || (c.type === "task" && prog.total > 0) || !work) && "· "}{formatHours(secs)} logged</span>}
              </p>
            </div>
            <div className="ml-12 flex basis-full items-center gap-2.5 @lg:ml-0 @lg:basis-auto">
              {work ? (
                <>
                  {inline ? null : hasAssignee(c) ? (
                    <span title={`Assigned to ${assigneesOf(c).map((id) => memberById.get(id)?.name).filter(Boolean).join(", ") || "nobody"}`}>
                      <AvatarStack members={assigneesOf(c).map((id) => memberById.get(id)).filter(Boolean)} max={3} />
                    </span>
                  ) : (
                    <span title={`Created by ${memberById.get(c.createdBy)?.name ?? "—"}`} className="opacity-60">
                      <Avatar member={memberById.get(c.createdBy)} size="sm" />
                    </span>
                  )}
                  {inline && (
                  <DonePop item={c}>
                    <PillSelect
                      label="Status"
                      readOnly={!canChangeStatus(me, c)}
                      value={c.status}
                      options={statusChoices(c.status)}
                      styleFor={(s) => STATUS_STYLE[s]?.pill}
                      onChange={(status) => actions.updateItem(c.id, { status })}
                    />
                  </DonePop>
                  )}
                </>
              ) : (
                <ProgressRing value={prog.pct} tone="green" size={40} stroke={4} />
              )}
              {work && <RowMenu item={c} />}
            </div>
          </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

/** The ⋯ menu on a row: edit, screenshots, log time (admin), delete. */
function RowMenu({ item }) {
  return <ItemMenu actions={useWorkActions(item)} />;
}
