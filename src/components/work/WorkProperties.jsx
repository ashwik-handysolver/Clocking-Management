import { useState } from "react";
import { Calendar, CircleDot, Flag, Hourglass, Lock, Tag, UserRound } from "lucide-react";
import MemberPicker from "../MemberPicker";
import { dueInfo, shortDate } from "../../lib/time";
import { PRIORITIES, statusChoices, assigneesOf, hasAssignee, dueLimits, dueProblem, isDone } from "../../store/model";
import { canEditAssignees, canEditDetails } from "../../store/permissions";
import { useStore } from "../../store/store";
import { Avatar, PRIORITY_STYLE, PillSelect, STATUS_STYLE, cx } from "../ui";

export const DUE_TONE = { danger: "text-red-600", warning: "text-amber-600", default: "text-stone-500", muted: "text-stone-400" };

/** One labelled cell in the properties panel. */
export function Prop({ icon: Icon, label, children, className }) {
  return (
    <div className={cx("min-w-0 rounded-2xl bg-surface p-3 ring-1 ring-stone-900/5", className)}>
      <dt className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-stone-400 uppercase">
        {Icon && (
          <span className="grid size-5 place-items-center rounded-md bg-brand-50 text-brand-500">
            <Icon className="size-3" strokeWidth={2.5} />
          </span>
        )}
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

export default function WorkProperties({ item }) {
  const { actions, me, state } = useStore();
  const { max: maxDue, parentType, min: minDue, childType } = dueLimits(state.items, item);
  const [dueError, setDueError] = useState("");
  const due = dueInfo(item.due, isDone(item));
  const update = (changes) => actions.updateItem(item.id, changes);
  const locked = !canEditDetails(me, item); // assigned to you by someone else: status only

  return (
    <dl className="grid grid-cols-2 gap-2 rounded-3xl bg-stone-50 p-2 @2xl:grid-cols-4">
      <Prop icon={CircleDot} label="Status">
        <PillSelect label="Status" value={item.status} options={statusChoices(item.status)} styleFor={(s) => STATUS_STYLE[s]?.pill} onChange={(status) => update({ status })} />
      </Prop>
      <Prop icon={Flag} label="Priority">
        {locked ? (
          <span className={cx("inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-bold", PRIORITY_STYLE[item.priority])}>{item.priority ?? "—"}</span>
        ) : (
          <PillSelect
            label="Priority"
            value={item.priority}
            options={PRIORITIES}
            styleFor={(p) => cx("bg-stone-100", PRIORITY_STYLE[p])}
            onChange={(priority) => update({ priority })}
          />
        )}
      </Prop>
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
            update({ due: v });
          }}
          className="w-full cursor-pointer rounded-lg bg-transparent outline-none hover:bg-stone-100 disabled:cursor-default disabled:hover:bg-transparent"
        />
        {dueError ? (
          <span className="block text-xs font-semibold text-red-600">{dueError}</span>
        ) : (
          item.due && <span className={cx("block text-xs font-bold", DUE_TONE[due.tone])}>{due.label}</span>
        )}
        {maxDue && !dueError && <span className="block text-[11px] text-stone-400 first-letter:uppercase">{parentType} due {shortDate(maxDue)}</span>}
        {minDue && !dueError && <span className="block text-[11px] text-stone-400">Latest {childType} due {shortDate(minDue)}</span>}
      </Prop>
      <Prop icon={Hourglass} label="Estimate">
        {item.estimate ? `${item.estimate} hours` : <span className="font-medium text-stone-400">Not set</span>}
      </Prop>
      {hasAssignee(item) ? (
        <>
          <Prop icon={UserRound} label="Assigned to" className="col-span-1 @2xl:col-span-2">
            <MemberPicker variant="inline" value={assigneesOf(item)} onChange={(assignees) => update({ assignees })} readOnly={!canEditAssignees(me, item)} />
          </Prop>
          <Prop icon={UserRound} label="Assigned by" className="col-span-1 @2xl:col-span-2">
            <PersonLabel value={item.assignedBy} title="Set automatically to whoever assigns the subtask" />
          </Prop>
        </>
      ) : (
        <Prop icon={UserRound} label="Created by" className="col-span-2 @2xl:col-span-4">
          <PersonLabel value={item.createdBy} title="Set automatically to whoever created the task" />
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
