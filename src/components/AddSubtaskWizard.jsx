import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleDot, Search } from "lucide-react";
import { ancestry, billingOf, BILLING_LABEL } from "../store/model";
import { useStore } from "../store/store";
import ItemForm, { TYPE_ICON } from "./ItemForm";
import { Button, Modal, cx, inputClass } from "./ui";

const STEPS = [
  { type: "client", label: "Client", child: "project" },
  { type: "project", label: "Project", child: "task" },
  { type: "task", label: "Task", child: "subtask" },
  { type: "subtask", label: "Subtask" },
];

/** Client, project and task above (or at) `contextId`, as far as they go. */
function presetFrom(index, contextId) {
  const chain = contextId ? ancestry(index, contextId) : [];
  const picked = [];
  for (const type of ["client", "project", "task"]) {
    const found = chain.find((x) => x.type === type);
    if (!found) break;
    picked.push(found.id);
  }
  return picked;
}

/**
 * Pick client → project → task, each step sliding in, then fill in the subtask form.
 * Opened from a page (`contextId`), the steps that page already answers are ticked and skipped.
 */
export default function AddSubtaskWizard({ contextId, onClose, toast }) {
  const { items, index } = useStore();
  const [picked, setPicked] = useState(() => presetFrom(index, contextId)); // ids chosen so far: [clientId, projectId, taskId]
  const [step, setStep] = useState(() => picked.length);
  const [dir, setDir] = useState(1); // 1 = forward (slide from right), -1 = back
  const [query, setQuery] = useState("");
  const panelRef = useRef(null);

  const go = (to) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setQuery("");
  };
  const pick = (id) => {
    setPicked((p) => [...p.slice(0, step), id]);
    go(step + 1);
  };

  // Focus the search box (or the subtask name) once each step has slid in.
  useEffect(() => {
    panelRef.current?.querySelector("[data-autofocus]")?.focus();
  }, [step]);

  const current = STEPS[step];
  const parentId = step > 0 ? picked[step - 1] : null;
  const options = useMemo(() => {
    if (current.type === "subtask") return [];
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.type === current.type && (step === 0 ? !i.parentId : i.parentId === parentId))
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .map((i) => ({ item: i, count: items.filter((c) => c.parentId === i.id && c.type === current.child).length }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [items, current, step, parentId, query]);

  const path = picked.slice(0, step).map((id) => index.get(id)?.name).filter(Boolean).join(" › ");

  return (
    <Modal title="Add subtask" subtitle={path || "Choose where it goes"} icon={CircleDot} size="lg" onClose={onClose}>
      {/* Step tabs: done steps can be clicked to go back */}
      <ol className="mb-5 grid grid-cols-4 gap-1 rounded-2xl bg-stone-100 p-1">
        {STEPS.map((s, i) => {
          const Icon = TYPE_ICON[s.type];
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.type} className="min-w-0">
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
                <span className="truncate">{done ? index.get(picked[i])?.name ?? s.label : s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div ref={panelRef} key={step} className={dir > 0 ? "animate-panel-in" : "animate-panel-back"}>
        {current.type === "subtask" ? (
          <ItemForm embedded type="subtask" lockType parentId={parentId} onBack={() => go(step - 1)} onClose={onClose} toast={toast} />
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
