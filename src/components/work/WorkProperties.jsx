import { useState } from "react";
import { Calendar, CircleDot, Lock, Tag, UserRound } from "lucide-react";
import MemberPicker from "../MemberPicker";
import { dueInfo, shortDate } from "../../lib/time";
import { PRIORITIES, statusChoices, assigneesOf, hasAssignee, dueLimits, dueProblem, isDone } from "../../store/model";
import { canChangeStatus, canEditAssignees, canEditDetails } from "../../store/permissions";
import { useStore } from "../../store/store";
import { Avatar, PillSelect, STATUS_STYLE, cx } from "../ui";
import { DonePop } from "../motion";

export const DUE_TONE = { danger: "text-red-600", warning: "text-amber-600", default: "text-stone-500", muted: "text-stone-400" };

/** One label / value pair in a properties grid: plain text, no box. */
export function Prop({ icon: Icon, label, children, className }) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
        {Icon && <Icon className="size-3.5 text-stone-400" aria-hidden />}
        {label}
      </dt>
      <dd className="min-w-0 text-sm font-semibold text-stone-800">{children}</dd>
    </div>
  );
}

/** Read-only person (subtask "assigned by", task "created by") — set automatically, never edited. */
export function PersonLabel({ value, title }) {
  const { memberById, me } = useStore();
  const member = memberById.get(value);
  return (
    <div className="flex items-center gap-2" title={title}>
      <Avatar member={member} size="sm" />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {member?.name ?? "—"}
        {value === me.id && <span className="ml-1 font-medium text-stone-400">(you)</span>}
      </span>
      <Lock className="size-3.5 shrink-0 text-stone-300" />
    </div>
  );
}

/**
 * An item's details as label / value pairs. People come first, then status and priority; the due
 * date only shows once one is set (set it from Edit). `compact` (an opened subtask row): no
 * dividers and no Status, since the row already shows it.
 */
export default function WorkProperties({ item, compact = false }) {
  const { actions, me, state } = useStore();
  const { max: maxDue, parentType, min: minDue, childType } = dueLimits(state.items, item);
  const [dueError, setDueError] = useState("");
  const due = dueInfo(item.due, isDone(item));
  const update = (changes) => actions.updateItem(item.id, changes);
  const locked = !canEditDetails(me, item); // assigned to you by someone else: status only

  return (
    <dl className={cx("grid grid-cols-2 gap-x-6 gap-y-3 @2xl:grid-cols-4", compact ? "py-1" : "gap-y-4 border-y border-stone-100 py-4")}>
      {hasAssignee(item) ? (
        <>
          <Prop icon={UserRound} label="Assigned to">
            <MemberPicker variant="inline" value={assigneesOf(item)} onChange={(assignees) => update({ assignees })} readOnly={!canEditAssignees(me, item)} />
          </Prop>
          <Prop icon={UserRound} label="Assigned by">
            <PersonLabel value={item.assignedBy} />
          </Prop>
        </>
      ) : (
        <Prop icon={UserRound} label="Created by">
          <PersonLabel value={item.createdBy} />
        </Prop>
      )}
      {!compact && (
        <Prop icon={CircleDot} label="Status">
          <DonePop item={item}>
            <PillSelect
              label="Status"
              value={item.status}
              options={statusChoices(item.status)}
              styleFor={(s) => STATUS_STYLE[s]?.pill}
              onChange={(status) => update({ status })}
              readOnly={!canChangeStatus(me, item)}
            />
          </DonePop>
        </Prop>
      )}
      {item.due && (
        <Prop icon={Calendar} label="Due date">
          <input
            type="date"
            aria-label="Due date"
            value={item.due ?? ""}
            disabled={locked}
            max={maxDue ?? undefined}
            min={minDue ?? undefined}
            onChange={(e) => {
              const v = e.target.value;
              const problem = dueProblem(state.items, item, v);
              if (problem) return setDueError(problem);
              setDueError("");
              update({ due: v || null });
            }}
            className="w-full cursor-pointer rounded-lg bg-transparent outline-none hover:bg-stone-100 disabled:cursor-default disabled:hover:bg-transparent"
          />
          {dueError ? (
            <span className="block text-xs font-semibold text-red-600">{dueError}</span>
          ) : (
            <span className={cx("block text-xs font-bold", DUE_TONE[due.tone])}>{due.label}</span>
          )}
          {maxDue && !dueError && <span className="block text-[11px] text-stone-400 first-letter:uppercase">{parentType} due {shortDate(maxDue)}</span>}
          {minDue && !dueError && <span className="block text-[11px] text-stone-400">Latest {childType} due {shortDate(minDue)}</span>}
        </Prop>
      )}
      {item.tags?.length > 0 && (
        <Prop icon={Tag} label="Tags" className="col-span-2 @2xl:col-span-4">
          <span className="flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span key={t} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
                #{t}
              </span>
            ))}
          </span>
        </Prop>
      )}
    </dl>
  );
}
