import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { canCreate } from "../../store/permissions";
import { useStore } from "../../store/store";
import AddWizard from "../AddSubtaskWizard";
import { useDialogs } from "../dialogs";
import { TYPE_ICON } from "../ItemForm";
import { Button, Popover, cx } from "../ui";

/*
 * The app's one Add button (header, everyone). It opens a short menu of what you may add, always in
 * the same order (Subtask, Task, then Project and Client for the admin). Picking one opens the
 * step-by-step popup with the places the current page already tells it ticked
 * (they can still be changed there).
 */

const KINDS = ["subtask", "task", "project", "client"];
const LABEL = { client: "Client", project: "Project", task: "Task", subtask: "Subtask" };

export default function AddMenu({ contextId }) {
  const { me } = useStore();
  const { toast } = useDialogs();
  const [adding, setAdding] = useState(null); // kind being added
  const kinds = KINDS.filter((k) => canCreate(me, k));

  return (
    <>
      <Popover
        align="right"
        className="w-52"
        trigger={({ toggle, open }) => (
          <Button
            variant="primary"
            iconOnly
            icon={Plus}
            onClick={toggle}
            aria-label="Add"
            aria-expanded={open}
            title="Add"
            // The + turns into an × while the menu is open.
            className={cx("[&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-smooth", open && "[&_svg]:rotate-[135deg]")}
          />
        )}
      >
        {(close) => (
          <div>
            <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold tracking-widest text-stone-400 uppercase">Add</p>
            <ul className="stagger">
              {kinds.map((k) => {
                const Icon = TYPE_ICON[k];
                return (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        setAdding(k);
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-brand-50"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-surface">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-bold text-stone-800">{LABEL[k]}</span>
                      <ChevronRight className="size-4 shrink-0 text-stone-300 group-hover:text-brand-500" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Popover>
      {adding && <AddWizard kind={adding} contextId={contextId} onClose={() => setAdding(null)} toast={toast} />}
    </>
  );
}
