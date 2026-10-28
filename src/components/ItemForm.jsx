import { useMemo, useState } from "react";
import { Building, Folder, ListChecks, CircleDot } from "lucide-react";
import { openItem } from "../lib/router";
import { BILLING, BILLING_LABEL, PARENT_TYPE, PRIORITIES, billingOf, PROJECT_STATUSES, STATUSES, TYPES, TYPE_LABEL, ancestry, clientCycle, dueLimits, dueProblem, pathLabel } from "../store/model";
import { shortDate, todayKey } from "../lib/time";
import { DEFAULT_SNAPSHOT_MINUTES, MAX_SNAPSHOT_MINUTES, MIN_SNAPSHOT_MINUTES, snapshotMinutesFor } from "../config";
import MemberPicker from "./MemberPicker";
import { canCreate, canEditAssignees, canSetSnapshotInterval, isAdmin } from "../store/permissions";
import { useStore } from "../store/store";
import TagInput from "./TagInput";
import { Button, Field, Modal, RequiredMark, Select, cx, inputClass } from "./ui";

export const TYPE_ICON = { client: Building, project: Folder, task: ListChecks, subtask: CircleDot };

/** Pick a sensible parent for a new `type` item based on what's currently selected. */
function resolveParent(index, contextId, type) {
  const parentType = PARENT_TYPE[type];
  if (!parentType || !contextId) return "";
  return ancestry(index, contextId).find((x) => x.type === parentType)?.id ?? "";
}

function initialValues(item, type, me) {
  return {
    parentId: item?.parentId ?? "",
    name: item?.name ?? "",
    description: item?.description ?? "",
    contactName: item?.contactName ?? "",
    contactEmail: item?.contactEmail ?? "",
    budgetHours: item?.budgetHours ?? "",
    cycleStart: item?.cycleStart || todayKey(), // defaults to the day the client is created
    cycleMonths: String(item?.cycleMonths ?? 1),
    projectStatus: type === "project" ? item?.status ?? "Active" : "Active",
    snapshotMinutes: String(snapshotMinutesFor(type === "project" ? item : null)),
    assignees: item?.assignees ?? [], // subtasks: at least one other team member must be picked
    status: item?.status ?? "To do",
    priority: item?.priority ?? "Medium",
    due: item?.due ?? "",
    estimate: item?.estimate ?? "",
    tags: item?.tags ?? [],
  };
}

/**
 * Create or edit a client / project / task / subtask.
 * Create: pass `type` and optionally `contextId` (the selected item, used to preselect a parent).
 * Edit: pass `id`.
 */
export default function ItemForm({ id, type: initialType = "client", contextId, billing: billingProp, lockType, onClose, toast }) {
  const { state, items, index, actions, me } = useStore();
  const editing = id ? index.get(id) : null;
  const [type, setType] = useState(editing?.type ?? initialType);
  const [values, setValues] = useState(() => {
    const v = initialValues(editing, editing?.type ?? initialType, me);
    if (!editing) v.parentId = resolveParent(index, contextId, initialType);
    v.billing = (editing && billingOf(index, editing.id)) || billingProp || (contextId && billingOf(index, contextId)) || "billable";
    return v;
  });
  // Work stays in its billing category: fixed when editing, or when opened from a category.
  const billingLocked = !!editing || !!billingProp || !!(contextId && billingOf(index, contextId));
  const [errors, setErrors] = useState({});
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e?.target ? e.target.value : e }));
  // Client billing cycle fields unlock once client hours are filled in.
  const cycleOn = values.budgetHours !== "" && Number(values.budgetHours) > 0;

  const changeType = (t) => {
    setType(t);
    setValues((v) => ({ ...v, parentId: resolveParent(index, contextId, t) }));
    setErrors({});
  };

  const parentType = PARENT_TYPE[type];
  const parentOptions = useMemo(
    () =>
      parentType
        ? items
            .filter((i) => i.type === parentType)
            .filter((i) => !billingLocked || parentType !== "task" || billingOf(index, i.id) === values.billing)
            .map((i) => ({ value: i.id, label: pathLabel(index, i.id, { includeSelf: true }) }))
            .sort((a, b) => a.label.localeCompare(b.label))
        : [],
    [items, index, parentType, billingLocked, values.billing],
  );
  const tagSuggestions = useMemo(() => [...new Set(items.flatMap((i) => i.tags ?? []))].sort(), [items]);
  const work = type === "task" || type === "subtask";
  // Subtasks have an assignee; tasks only record who created them. Both "by" fields are automatic.
  const isSubtask = type === "subtask";
  const autoPersonId = editing ? (isSubtask ? editing.assignedBy : editing.createdBy) : me.id;
  const autoPersonLabel = (state.members.find((m) => m.id === autoPersonId)?.name ?? "—") + (autoPersonId === me.id ? " (you)" : "");

  // Due dates nest: not after the parent's, not before any child's.
  const dueItem = { type, parentId: values.parentId, id: editing?.id };
  const limits = dueLimits(state.items, dueItem);
  const dueHint = limits.max
    ? `By ${shortDate(limits.max)} (${limits.parentType}'s due date)`
    : limits.min
      ? `On or after ${shortDate(limits.min)} (latest ${limits.childType})`
      : undefined;
  const dueInput = (
    <input type="date" value={values.due} max={limits.max ?? undefined} min={limits.min ?? undefined} onChange={set("due")} className={inputClass} />
  );

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!values.name.trim()) errs.name = "Name is required";
    if (parentType && !values.parentId) errs.parentId = `Choose a ${TYPE_LABEL[parentType].toLowerCase()}`;
    if (values.contactEmail && !/^\S+@\S+\.\S+$/.test(values.contactEmail)) errs.contactEmail = "Enter a valid email";
    if (values.estimate !== "" && !(Number(values.estimate) >= 0)) errs.estimate = "Enter hours, e.g. 2.5";
    const setsCycle = type === "client" && isAdmin(me);
    if (setsCycle && values.budgetHours !== "" && !(Number(values.budgetHours) > 0)) errs.budgetHours = "Enter hours, e.g. 120";
    const months = Number(values.cycleMonths);
    // Start date and duration only matter (and only unlock) once client hours are filled in.
    const hasHours = values.budgetHours !== "" && Number(values.budgetHours) > 0;
    if (setsCycle && hasHours && !(Number.isInteger(months) && months >= 1 && months <= 24)) errs.cycleMonths = "Whole months from 1 to 24";
    if (setsCycle && hasHours && !values.cycleStart) errs.cycleStart = "Pick a start date";
    const shotMins = Number(values.snapshotMinutes);
    const setsInterval = type === "project" && canSetSnapshotInterval(me);
    if (setsInterval && !(Number.isInteger(shotMins) && shotMins >= MIN_SNAPSHOT_MINUTES && shotMins <= MAX_SNAPSHOT_MINUTES))
      errs.snapshotMinutes = `Whole minutes from ${MIN_SNAPSHOT_MINUTES} to ${MAX_SNAPSHOT_MINUTES}`;
    if (isSubtask && !values.assignees.length) errs.assignees = "Choose at least one team member";
    const dueErr = dueProblem(state.items, dueItem, values.due);
    if (dueErr) errs.due = dueErr;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const fields = { name: values.name.trim(), description: values.description.trim(), parentId: values.parentId || null };
    if (type === "client") Object.assign(fields, { contactName: values.contactName.trim(), contactEmail: values.contactEmail.trim() });
    if (setsCycle)
      Object.assign(fields, {
        budgetHours: values.budgetHours === "" ? null : Number(values.budgetHours),
        cycleStart: hasHours ? values.cycleStart : null,
        cycleMonths: hasHours ? months : null,
      });
    if (type === "task" && !editing) fields.billing = values.billing;
    if (type === "project") Object.assign(fields, { status: values.projectStatus, due: values.due, ...(setsInterval && { snapshotIntervalMinutes: shotMins }) });
    if (work)
      Object.assign(fields, {
        // Subtasks only; "assigned by" / "created by" are set by the store to the signed-in user.
        ...(isSubtask && { assignees: values.assignees }),
        status: values.status,
        priority: values.priority,
        due: values.due,
        estimate: values.estimate === "" ? null : Number(values.estimate),
        tags: values.tags,
      });

    if (editing) {
      actions.updateItem(editing.id, fields);
      toast(`${TYPE_LABEL[type]} updated`);
    } else {
      const newId = actions.addItem({ type, ...fields });
      if (isSubtask && !values.assignees.includes(me.id)) {
        // Subtasks are only visible to their assignees, so stay on the task.
        const names = values.assignees.map((id) => state.members.find((m) => m.id === id)?.name.split(" ")[0]).join(", ");
        openItem(fields.parentId);
        toast(`Subtask assigned to ${names} — only they can see it`);
      } else {
        openItem(newId);
        toast(`${TYPE_LABEL[type]} created`);
      }
    }
    onClose();
  };

  return (
    <Modal
      as="form"
      onSubmit={submit}
      noValidate
      size="lg"
      title={editing ? `Edit ${TYPE_LABEL[type].toLowerCase()}` : `New ${TYPE_LABEL[type].toLowerCase()}`}
      subtitle={editing ? pathLabel(index, editing.id, { includeSelf: true }) : undefined}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {editing ? "Save changes" : `Create ${TYPE_LABEL[type].toLowerCase()}`}
          </Button>
        </>
      }
    >
      {!editing && !lockType && (
        <div className={cx("mb-5 grid gap-1 rounded-2xl bg-stone-100 p-1", canCreate(me, "client") ? "grid-cols-4" : "grid-cols-2")}>
          {TYPES.filter((t) => canCreate(me, t)).map((t) => {
            const Icon = TYPE_ICON[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => changeType(t)}
                className={cx(
                  "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition",
                  type === t ? "bg-brand-500 text-white shadow-glow" : "text-stone-500 hover:text-stone-800",
                )}
              >
                <Icon className="size-3.5" />
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {parentType && (
          <Field label={TYPE_LABEL[parentType]} required error={errors.parentId} className="sm:col-span-2">
            <Select
              value={values.parentId}
              onChange={set("parentId")}
              options={[{ value: "", label: `Select a ${TYPE_LABEL[parentType].toLowerCase()}…` }, ...parentOptions]}
            />
          </Field>
        )}

        <Field label={`${TYPE_LABEL[type]} name`} required error={errors.name} className="sm:col-span-2">
          <input data-autofocus value={values.name} onChange={set("name")} placeholder={`e.g. ${PLACEHOLDER[type]}`} className={inputClass} />
        </Field>

        {type === "client" && (
          <>
            <Field label="Contact person">
              <input value={values.contactName} onChange={set("contactName")} placeholder="Full name" className={inputClass} />
            </Field>
            <Field label="Contact email" error={errors.contactEmail}>
              <input type="email" value={values.contactEmail} onChange={set("contactEmail")} placeholder="name@company.com" className={inputClass} />
            </Field>
            {isAdmin(me) && (
              <>
                <Field label="Client hours" error={errors.budgetHours} hint="Hours per billing cycle">
                  <span className="relative block">
                    <input type="number" min="0" step="0.5" inputMode="decimal" value={values.budgetHours} onChange={set("budgetHours")} placeholder="e.g. 120" className={cx(inputClass, "pr-14")} />
                    <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-semibold text-stone-400">hours</span>
                  </span>
                </Field>
                <Field label="Cycle start" required={cycleOn} error={errors.cycleStart} hint={cycleOn ? undefined : "Fill in client hours first"}>
                  <input type="date" disabled={!cycleOn} value={values.cycleStart} onChange={set("cycleStart")} className={inputClass} />
                </Field>
                <Field
                  label="Duration"
                  required={cycleOn}
                  error={errors.cycleMonths}
                  hint={
                    !cycleOn
                      ? "Fill in client hours first"
                      : values.cycleStart && Number(values.cycleMonths) >= 1
                      ? `Ends ${shortDate(clientCycle({ budgetHours: 1, cycleStart: values.cycleStart, cycleMonths: Number(values.cycleMonths) }, values.cycleStart).end)}, then repeats`
                      : undefined
                  }
                >
                  <span className="relative block">
                    <input type="number" min="1" max="24" step="1" inputMode="numeric" disabled={!cycleOn} value={values.cycleMonths} onChange={set("cycleMonths")} className={cx(inputClass, "pr-16")} />
                    <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-semibold text-stone-400">
                      {Number(values.cycleMonths) === 1 ? "month" : "months"}
                    </span>
                  </span>
                </Field>
              </>
            )}
          </>
        )}

        {type === "project" && (
          <>
            <Field label="Status">
              <Select value={values.projectStatus} onChange={set("projectStatus")} options={PROJECT_STATUSES} />
            </Field>
            <Field label="Target date" error={errors.due} hint={dueHint ?? "Optional"}>
              {dueInput}
            </Field>
            <Field
              label="Screenshot interval"
              required={canSetSnapshotInterval(me)}
              error={errors.snapshotMinutes}
              hint={
                canSetSnapshotInterval(me)
                  ? `While someone is clocked in on this project. Default ${DEFAULT_SNAPSHOT_MINUTES} minutes.`
                  : "Set by the admin"
              }
              className="sm:col-span-2"
            >
              <span className="relative block">
                <input
                  disabled={!canSetSnapshotInterval(me)}
                  type="number"
                  min={MIN_SNAPSHOT_MINUTES}
                  max={MAX_SNAPSHOT_MINUTES}
                  step="1"
                  value={values.snapshotMinutes}
                  onChange={set("snapshotMinutes")}
                  className={cx(inputClass, "pr-20")}
                />
                <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-stone-400">minutes</span>
              </span>
            </Field>
          </>
        )}

        {work && (
          <>
            <Field
              label="Billing"
              hint={isSubtask ? "Same as its task" : editing ? "Can't be changed after the task is created" : "Its subtasks stay in this category"}
              className="sm:col-span-2"
            >
              <Select
                value={(isSubtask && values.parentId && billingOf(index, values.parentId)) || values.billing}
                onChange={set("billing")}
                disabled={isSubtask || billingLocked}
                options={BILLING.map((b) => ({ value: b, label: BILLING_LABEL[b] }))}
              />
            </Field>
            {isSubtask ? (
              <>
                {/* Not a <label>-wrapped input: the picker is a button + list, so use a plain group. */}
                <div className="min-w-0">
                  <span className="mb-1.5 block text-xs font-bold text-stone-600">
                    Assigned to
                    <RequiredMark />
                  </span>
                  <MemberPicker value={values.assignees} onChange={set("assignees")} invalid={!!errors.assignees} readOnly={!!editing && !canEditAssignees(me, editing)} />
                  {errors.assignees ? (
                    <span className="mt-1.5 block text-xs font-medium text-red-600">{errors.assignees}</span>
                  ) : (
                    <span className="mt-1.5 block text-xs text-stone-400">One or more people</span>
                  )}
                </div>
                <Field label="Assigned by" hint={editing ? "Becomes you if you reassign" : "Set automatically"}>
                  <input value={autoPersonLabel} disabled className={inputClass} />
                </Field>
              </>
            ) : (
              <Field label="Created by" hint="Set automatically" className="sm:col-span-2">
                <input value={autoPersonLabel} disabled className={inputClass} />
              </Field>
            )}
            <Field label="Status">
              <Select value={values.status} onChange={set("status")} options={STATUSES} />
            </Field>
            <Field label="Priority">
              <Select value={values.priority} onChange={set("priority")} options={PRIORITIES} />
            </Field>
            <Field label="Due date" error={errors.due} hint={dueHint ? `Optional · ${dueHint}` : "Optional"}>
              {dueInput}
            </Field>
            <Field label="Estimate (hours)" error={errors.estimate}>
              <input type="number" min="0" step="0.25" value={values.estimate} onChange={set("estimate")} placeholder="e.g. 4" className={inputClass} />
            </Field>
            <Field label="Tags" hint="Press Enter or comma to add" className="sm:col-span-2">
              <TagInput value={values.tags} onChange={set("tags")} suggestions={tagSuggestions} />
            </Field>
          </>
        )}

        <Field label="Description" className="sm:col-span-2">
          <textarea
            value={values.description}
            onChange={set("description")}
            rows={3}
            placeholder={work ? "Context, expected outcome, acceptance criteria…" : "Short summary"}
            className={cx(inputClass, "h-auto resize-y py-2")}
          />
        </Field>
      </div>
    </Modal>
  );
}

const PLACEHOLDER = {
  client: "Acme Corporation",
  project: "Website redesign",
  task: "Build checkout page",
  subtask: "Create payment form UI",
};
