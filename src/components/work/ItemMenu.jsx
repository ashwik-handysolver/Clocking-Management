import { Camera, Clock, MoreHorizontal, Pencil, Trash } from "lucide-react";
import { navigate } from "../../lib/router";
import { canCreate, canDeleteItem, canEditDetails, canLogManualTime } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Popover, cx } from "../ui";
import { useDeleteItem } from "./useDeleteItem";

/**
 * The usual actions for a task or subtask, as menu entries: Edit, Screenshots, Log time (admin,
 * subtasks) and Delete. Each only appears when the signed-in person may do it.
 * `afterDelete` runs once a delete goes through (e.g. go to the parent page).
 */
export function useWorkActions(item, { afterDelete } = {}) {
  const { me, teamEntries, index } = useStore();
  const { openItemForm, openEntryForm } = useDialogs();
  const askDelete = useDeleteItem(); // warns with the clockings and screenshots that go too
  if (!item) return [];
  const ids = new Set([item.id, ...index.childrenOf(item.id).map((c) => c.id)]);
  const hasTime = teamEntries.some((e) => ids.has(e.subtaskId));
  const work = item.type === "task" || item.type === "subtask";
  return [
    { icon: Pencil, label: "Edit", onClick: () => openItemForm({ id: item.id }), hidden: !canEditDetails(me, item) || (item.type !== "subtask" && !canCreate(me, item.type)) },
    { icon: Camera, label: "Screenshots", onClick: () => navigate("screenshots", null, { [item.type]: item.id }), hidden: !work },
    { icon: Clock, label: "Log time", onClick: () => openEntryForm({ subtaskId: item.id, scopeId: item.id }), hidden: item.type !== "subtask" || !canLogManualTime(me) },
    { icon: Trash, label: "Delete", danger: true, onClick: () => askDelete(item, afterDelete ? { after: afterDelete } : undefined), hidden: !canDeleteItem(me, item, hasTime) },
  ];
}

/**
 * The "⋯" menu for an item's secondary actions (edit, screenshots, log time, archive, delete…),
 * so rows and headers show one small button instead of a row of labelled ones.
 * `actions`: [{ icon, label, onClick, danger?, hidden? }]. Nothing to show → no button.
 * Clicks never reach the row underneath (rows open or expand on click).
 */
export default function ItemMenu({ actions, label = "More actions", className }) {
  const shown = actions.filter((a) => a && !a.hidden);
  if (!shown.length) return null;
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className={className}>
      <Popover
        align="right"
        className="w-48"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label={label}
            title={label}
            aria-expanded={open}
            className={cx(
              "grid size-8 shrink-0 place-items-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900",
              open && "bg-stone-100 text-stone-900",
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      >
        {(close) => (
          <ul>
            {shown.map(({ icon: Icon, label: text, onClick, danger }) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onClick();
                  }}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition-colors",
                    danger ? "text-red-600 hover:bg-red-50" : "text-stone-700 hover:bg-stone-100",
                  )}
                >
                  {Icon && <Icon className={cx("size-4 shrink-0", danger ? "text-red-500" : "text-stone-400")} />}
                  {text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </div>
  );
}
