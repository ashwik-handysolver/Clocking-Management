import { useMemo, useState } from "react";
import { combineDateTime, formatHours, formatTime, toDateKey, toTimeInput, todayKey } from "../lib/time";
import { descendants, pathLabel, workingMembers } from "../store/model";
import { canClockOn, canLogManualTime } from "../store/permissions";
import { useStore } from "../store/store";
import MicButton from "./MicButton";
import { Button, Field, Modal, Select, cx, inputClass } from "./ui";

/**
 * Add or edit a time entry.
 * Add: pass `subtaskId` (preselected) and/or `scopeId` (limits the subtask list).
 * Edit: pass `entryId`.
 */
export default function EntryForm({ entryId, subtaskId, scopeId, memberId: memberProp, onClose, toast }) {
  // `teamEntries` is your own time (or everyone's for the admin, whose corrections are recorded).
  const { state, items, teamEntries, allIndex, actions, me, memberById } = useStore();
  const index = allIndex;
  const entry = entryId ? teamEntries.find((e) => e.id === entryId) : null;
  const owner = entry ? memberById.get(entry.memberId) : me;
  // New manual entries are logged by the admin for a team member.
  const forMember = !entry && canLogManualTime(me);
  const memberOptions = workingMembers(state.members, state.items, teamEntries).map((m) => ({ value: m.id, label: m.id === me.id ? `${m.name} (you)` : m.name }));
  const running = entry && entry.end == null;

  const [values, setValues] = useState(() => {
    if (entry)
      return {
        subtaskId: entry.subtaskId,
        date: toDateKey(entry.start),
        from: toTimeInput(entry.start),
        to: entry.end ? toTimeInput(entry.end) : "",
        note: entry.note ?? "",
      };
    const now = new Date();
    const end = `${String(now.getHours()).padStart(2, "0")}:00`;
    const start = `${String(Math.max(0, now.getHours() - 1)).padStart(2, "0")}:00`;
    return { memberId: memberProp ?? "", subtaskId: subtaskId ?? "", date: todayKey(), from: start, to: end, note: "" };
  });
  const [error, setError] = useState("");
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const subtaskOptions = useMemo(() => {
    const pool = scopeId ? descendants(index, scopeId) : items;
    return pool
      .filter((i) => canClockOn(forMember ? { id: values.memberId } : owner ?? me, i)) // only subtasks that person is assigned to
      .map((i) => ({ value: i.id, label: pathLabel(index, i.id, { includeSelf: true }) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items, index, scopeId, me, owner, forMember, values.memberId]);

  const start = values.date && values.from ? combineDateTime(values.date, values.from) : NaN;
  let end = values.to ? combineDateTime(values.date, values.to) : NaN;
  if (end <= start) end += 24 * 3600 * 1000; // past midnight → next day
  const seconds = running ? null : (end - start) / 1000;

  const submit = (e) => {
    e.preventDefault();
    if (forMember && !values.memberId) return setError("Choose the team member this time is for.");
    if (!values.subtaskId) return setError("Choose the subtask this time was spent on.");
    if (Number.isNaN(start)) return setError("Enter a start time.");
    if (!running) {
      if (Number.isNaN(end)) return setError("Enter an end time.");
      if (seconds > 16 * 3600) return setError("An entry can't be longer than 16 hours.");
      if (end > Date.now() + 60_000) return setError("End time can't be in the future.");
    } else if (start > Date.now()) {
      return setError("Start time can't be in the future.");
    }

    // No double counting: the person can't have two clockings at the same time.
    const who = forMember ? values.memberId : entry?.memberId ?? me.id;
    const until = running ? Date.now() : end;
    const clash = teamEntries.find((o) => o.memberId === who && o.id !== entry?.id && start < (o.end ?? Date.now()) && until > o.start);
    if (clash) {
      const name = index.get(clash.subtaskId)?.name ?? "another subtask";
      return setError(`Overlaps ${formatTime(clash.start)}–${clash.end ? formatTime(clash.end) : "now"} on “${name}”. Change the times.`);
    }

    const fields = { subtaskId: values.subtaskId, start, note: values.note.trim(), ...(forMember && { memberId: values.memberId }) };
    if (!running) fields.end = end;
    if (entry) {
      actions.updateEntry(entry.id, fields);
      toast("Time entry updated");
    } else {
      actions.addEntry(fields);
      toast(`Logged ${formatHours(seconds)}`);
    }
    onClose();
  };

  return (
    <Modal
      as="form"
      onSubmit={submit}
      noValidate
      title={entry ? "Edit time entry" : "Log time"}
      subtitle={entry ? (owner?.id === me.id ? `Your time · ${me.name}` : `${owner?.name}'s time · your change is recorded`) : forMember ? "Add time for a team member without the timer" : `Add your time without the timer · ${me.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {entry ? "Save entry" : "Log time"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {forMember && (
          <Field label="Team member" required className="col-span-2">
            <Select
              value={values.memberId}
              onChange={(e) => {
                const memberId = e.target.value;
                // Keep the subtask if this person is assigned to it.
                setValues((v) => ({ ...v, memberId, subtaskId: canClockOn({ id: memberId }, index.get(v.subtaskId)) ? v.subtaskId : "" }));
              }}
              options={[{ value: "", label: "Select a team member…" }, ...memberOptions]}
            />
          </Field>
        )}
        <Field label="Subtask" required className="col-span-2">
          <Select
            value={values.subtaskId}
            onChange={set("subtaskId")}
            options={[{ value: "", label: "Select a subtask…" }, ...subtaskOptions]}
          />
        </Field>
        <Field label="Date" required className="col-span-2">
          <input type="date" max={todayKey()} value={values.date} onChange={set("date")} className={inputClass} />
        </Field>
        <Field label="From" required>
          <input type="time" value={values.from} onChange={set("from")} className={inputClass} />
        </Field>
        <Field label="To" required>
          {running ? (
            <div className={cx(inputClass, "flex items-center text-emerald-700")}>Timer running</div>
          ) : (
            <input type="time" value={values.to} onChange={set("to")} className={inputClass} />
          )}
        </Field>
        <Field label="Note" className="col-span-2">
          <span className="relative block">
            <input value={values.note} onChange={set("note")} placeholder="What did you work on? (optional)" className={cx(inputClass, "pr-12")} />
            <MicButton value={values.note} onChange={(text) => setValues((v) => ({ ...v, note: text }))} className="absolute top-1/2 right-1 -translate-y-1/2" />
          </span>
        </Field>
      </div>

      {!running && seconds > 0 && (
        <p className="mt-4 flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Duration <strong className="text-lg font-extrabold">{formatHours(seconds)}</strong>
        </p>
      )}
      {error && <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
    </Modal>
  );
}
