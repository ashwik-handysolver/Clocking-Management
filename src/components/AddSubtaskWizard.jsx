import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Plus, Search } from "lucide-react";
import { ancestry, billingOf, BILLING_LABEL } from "../store/model";
import { useStore } from "../store/store";
import ItemForm, { TYPE_ICON } from "./ItemForm";
import { Button, Modal, cx, inputClass } from "./ui";

/*
 * Adding anything (opened from the header's + menu, the app's only Add button).
 * `kind` is what's being added; first you pick where it goes, one step at a time, then fill in the form:
 *   Client:  form
 *   Project: Client → form
 *   Task:    Client → Project → form
 *   Subtask: Client → Project → Task → form
 * Steps the current page already answers (`contextId`) are ticked; click a ticked step to change it.
 */

const LEVELS = [
  { type: "client", label: "Client", child: "project" },
  { type: "project", label: "Project", child: "task" },
  { type: "task", label: "Task", child: "subtask" },
];
// How many places each kind needs picked before its form.
export const PICK = { client: 0, project: 1, task: 2, subtask: 3 };
const LABEL = { client: "Client", project: "Project", task: "Task", subtask: "Subtask" };

/** The first `count` of client, project, task above (or at) `contextId`, as far as they go. */
export function presetFrom(index, contextId, count) {
  const chain = contextId ? ancestry(index, contextId) : [];
  const picked = [];
  for (const { type } of LEVELS.slice(0, count)) {
    const found = chain.find((x) => x.type === type);
    if (!found) break;
    picked.push(found.id);
  }
  return picked;
}

export default function AddSubtaskWizard({ kind, contextId, onClose, toast }) {
  const { items, index } = useStore();
  const [picked, setPicked] = useState(() => presetFrom(index, contextId, PICK[kind])); // [clientId, projectId, taskId]
  const [step, setStep] = useState(() => picked.length);
  const [dir, setDir] = useState(1); // 1 = forward (slide from right), -1 = back
  const [query, setQuery] = useState("");
  const panelRef = useRef(null);

  const levels = PICK[kind]; // steps before the form
  const steps = [...LEVELS.slice(0, levels), { type: kind, label: LABEL[kind], form: true }];

  const go = (to) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setQuery("");
  };
  const pick = (id) => {
    setPicked((p) => [...p.slice(0, step), id]);
    go(step + 1);
  };

  // Focus the search box (or the name field) once each step has slid in.
  useEffect(() => {
    panelRef.current?.querySelector("[data-autofocus]")?.focus();
  }, [step, kind]);

  const current = steps[step];
  const parentId = step > 0 ? picked[step - 1] : null;
  const options = useMemo(() => {
    if (current.form) return [];
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.type === current.type && (step === 0 ? !i.parentId : i.parentId === parentId))
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .map((i) => ({ item: i, count: items.filter((c) => c.parentId === i.id && c.type === current.child).length }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [items, current, step, parentId, query]);

  const path = picked.slice(0, step).map((id) => index.get(id)?.name).filter(Boolean).join(" › ");

  return (
    <Modal title={`Add ${LABEL[kind].toLowerCase()}`} subtitle={kind === "client" ? undefined : path || "Choose where it goes"} icon={TYPE_ICON[kind] ?? Plus} size="lg" onClose={onClose}>
      {/* Steps: done ones can be clicked to change them */}
      {steps.length > 1 && (
      <ol className={cx("mb-5 grid gap-1 rounded-2xl bg-stone-100 p-1", { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[steps.length])}>
        {steps.map((s, i) => {
          const Icon = TYPE_ICON[s.type];
          const done = i < step;
          const active = i === step;
          return (
            <li key={`${s.type}-${i}`} className="min-w-0">
              <button
                type="button"
                disabled={!done}
                onClick={() => go(i)}
                title={done ? index.get(picked[i])?.name : undefined}
                className={cx(
                  "flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition",
                  active && "bg-brand-500 text-white shadow-glow",
                  done && "text-stone-700 hover:bg-surface",
                  !active && !done && "cursor-default text-stone-400",
                )}
              >
                {done ? <Check className="size-3.5 shrink-0 text-emerald-600" /> : <Icon className="size-3.5 shrink-0" />}
                <span className="truncate">{done ? index.get(picked[i])?.name ?? s.label : s.form ? `New ${s.label.toLowerCase()}` : s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      )}

      <div ref={panelRef} key={`${kind}-${step}`} className={dir > 0 ? "animate-panel-in" : "animate-panel-back"}>
        {current.form ? (
          <ItemForm
            embedded
            type={kind}
            lockType
            parentId={parentId ?? undefined}
            backLabel={step > 0 ? "Back" : "Cancel"}
            onBack={step > 0 ? () => go(step - 1) : onClose}
            onClose={onClose}
            toast={toast}
          />
        ) : (
          <>
            <label className="relative mb-3 block">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
              <input
                data-autofocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${current.label.toLowerCase()}s…`}
                className={cx(inputClass, "pl-10")}
              />
            </label>
            {options.length ? (
              <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                {options.map(({ item, count }) => {
                  const Icon = TYPE_ICON[item.type];
                  const billing = item.type === "task" ? billingOf(index, item.id) : null;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => pick(item.id)}
                        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 ring-stone-200 transition hover:bg-brand-50 hover:ring-brand-300"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-surface">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-stone-800">{item.name}</span>
                          <span className="block truncate text-xs text-stone-400">
                            {count} {current.child}
                            {count === 1 ? "" : "s"}
                            {billing && ` · ${BILLING_LABEL[billing]}`}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                {query ? `No ${current.label.toLowerCase()}s match “${query}”.` : `No ${current.label.toLowerCase()}s here yet.`}
              </p>
            )}
            {step > 0 && (
              <div className="mt-4 flex">
                <Button onClick={() => go(step - 1)}>Back</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
