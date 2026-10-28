import { useState } from "react";
import { ChevronDown, ExternalLink, Folder, Pencil, Plus } from "lucide-react";
import { openItem } from "../../lib/router";
import { dueInfo, formatHours } from "../../lib/time";
import { BILLING_LABEL, CHILD_TYPE, billingOf, statusChoices, TYPE_LABEL, assigneesOf, hasAssignee, isDone, isWork, progressOf } from "../../store/model";
import { canChangeStatus, canEditDetails } from "../../store/permissions";
import { useStore } from "../../store/store";
import { Segmented } from "../admin/AdminPage";
import { useDialogs } from "../dialogs";
import { TYPE_ICON } from "../ItemForm";
import { Avatar, AvatarStack, Button, EmptyState, PillSelect, PriorityLabel, ProgressRing, STATUS_STYLE, StatusIcon, cx } from "../ui";
import ClockCard, { ClockButton } from "./ClockCard";
import WorkProperties from "./WorkProperties";

const DUE_TONE = { danger: "text-red-600 font-bold", warning: "text-amber-600 font-semibold", default: "text-stone-500", muted: "text-stone-400" };

export default function ChildrenList({ item, billing, seconds }) {
  const [openId, setOpenId] = useState(null); // subtask expanded in place
  const { index, actions, memberById, me } = useStore();
  const { openItemForm } = useDialogs();
  const childType = CHILD_TYPE[item.type];
  // A task's subtasks are split into two tabs: ones you assigned and ones assigned to you.
  const [who, setWho] = useState("to");
  const subtasks = childType === "subtask";
  // A project's tasks are shown one billing category at a time (when `billing` is given).
  const byBilling = billing && childType === "task";
  const children = index
    .childrenOf(item.id)
    .filter((c) => !byBilling || billingOf(index, c.id) === billing)
    .filter((c) => !subtasks || who === "all" || (who === "by" ? c.assignedBy === me.id : (c.assignees ?? []).includes(me.id)));
  const tabs = subtasks && (
    <Segmented
      label="Subtasks"
      value={who}
      onChange={setWho}
      options={[
        ["to", "Assigned to me"],
        ["by", "Assigned by me"],
        ["all", "All"],
      ]}
    />
  );
  const label = (byBilling ? `${BILLING_LABEL[billing].toLowerCase()} ` : "") + TYPE_LABEL[childType].toLowerCase();
  const add = () => openItemForm({ type: childType, contextId: item.id, lockType: true, ...(byBilling && { billing }) });

  if (!children.length) {
    return (
      <div className="space-y-3">
      {tabs}
      <EmptyState
        icon={TYPE_ICON[childType]}
        title={subtasks ? (who === "all" ? "No subtasks yet" : who === "by" ? "No subtasks assigned by you" : "No subtasks assigned to you") : `No ${label}s yet`}
        action={
          <Button variant="primary" size="sm" icon={Plus} onClick={add}>
            Add {label}
          </Button>
        }
      />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tabs && <div className="pb-1">{tabs}</div>}
      {children.map((c) => {
        const work = isWork(c);
        const prog = progressOf(index, c.id);
        const due = work ? dueInfo(c.due, isDone(c)) : null;
        // A subtask you're not on shows none of your time.
        const secs = c.type === "subtask" && !assigneesOf(c).includes(me.id) ? 0 : seconds.get(c.id) ?? 0;
        // Subtasks open in place; projects and tasks go to their own page.
        const inline = c.type === "subtask";
        const expanded = inline && openId === c.id;
        const activate = () => (inline ? setOpenId(expanded ? null : c.id) : openItem(c.id));
        return (
          <div key={c.id} className={cx("rounded-2xl transition", expanded ? "bg-brand-50/60 ring-2 ring-brand-200" : "bg-stone-50")}>
          <div
            role="button"
            tabIndex={0}
            onClick={activate}
            onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && activate()}
            aria-expanded={inline ? expanded : undefined}
            className={cx(
              "group flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-3 transition @lg:flex-nowrap",
              !expanded && "hover:bg-brand-50/70",
            )}
          >
            {c.type === "subtask" ? (
              <ClockButton subtask={c} />
            ) : c.type === "task" ? (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface shadow-sm">
                <StatusIcon status={c.status} className="size-[18px]" />
              </span>
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-stone-500 shadow-sm">
                <Folder className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className={cx("truncate text-sm font-bold text-stone-800 group-hover:text-brand-700", isDone(c) && "!text-stone-400 line-through")}>{c.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-stone-400">
                {work ? (
                  <>
                    <span className={DUE_TONE[due.tone]}>{due.label}</span>
                    {c.type === "task" && prog.total > 0 && <span>· {prog.done}/{prog.total} subtasks</span>}
                  </>
                ) : (
                  <span>
                    {index.childrenOf(c.id).length} {TYPE_LABEL[CHILD_TYPE[c.type]].toLowerCase()}s · {prog.done}/{prog.total} done
                  </span>
                )}
                {secs > 0 && <span>· {formatHours(secs)} logged</span>}
              </p>
            </div>
            <div className="ml-12 flex basis-full items-center gap-2.5 @lg:ml-0 @lg:basis-auto">
              {work ? (
                <>
                  <PriorityLabel priority={c.priority} compact />
                  {hasAssignee(c) ? (
                    <span title={`Assigned to ${assigneesOf(c).map((id) => memberById.get(id)?.name).filter(Boolean).join(", ") || "nobody"}`}>
                      <AvatarStack members={assigneesOf(c).map((id) => memberById.get(id)).filter(Boolean)} max={3} />
                    </span>
                  ) : (
                    <span title={`Created by ${memberById.get(c.createdBy)?.name ?? "—"}`} className="opacity-60">
                      <Avatar member={memberById.get(c.createdBy)} size="sm" />
                    </span>
                  )}
                  <PillSelect
                    label="Status"
                    readOnly={!canChangeStatus(me, c)}
                    readOnlyTitle={`Only whoever created this ${c.type} can change it`}
                    value={c.status}
                    options={statusChoices(c.status)}
                    styleFor={(s) => STATUS_STYLE[s]?.pill}
                    onChange={(status) => actions.updateItem(c.id, { status })}
                    className="ring-1 ring-stone-900/5"
                  />
                </>
              ) : (
                <ProgressRing value={prog.pct} tone="green" size={40} stroke={4} />
              )}
              {inline && <ChevronDown className={cx("size-4 shrink-0 text-stone-400 transition-transform", expanded && "rotate-180")} />}
            </div>
          </div>
          {expanded && <SubtaskDetails subtask={c} />}
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-3 text-sm font-bold text-stone-400 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-600"
      >
        <Plus className="size-4" /> Add {label}
      </button>
    </div>
  );
}

/** A subtask opened in place on its task page: properties, description and the clock. */
function SubtaskDetails({ subtask }) {
  const { openItemForm } = useDialogs();
  const { me } = useStore();
  return (
    <div className="animate-fade-in space-y-3 px-3 pb-3">
      {subtask.description && <p className="px-1 text-sm whitespace-pre-wrap text-stone-600">{subtask.description}</p>}
      <WorkProperties item={subtask} />
      <ClockCard subtask={subtask} />
      <div className="flex justify-end gap-1.5">
        {canEditDetails(me, subtask) && (
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openItemForm({ id: subtask.id })}>
            Edit
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openItem(subtask.id)}>
          Open full page
        </Button>
      </div>
    </div>
  );
}
