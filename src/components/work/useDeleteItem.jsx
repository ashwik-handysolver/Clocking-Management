import { Camera, Clock, FolderTree, TriangleAlert } from "lucide-react";
import { formatHours } from "../../lib/time";
import { TYPE_LABEL, descendants, entrySeconds } from "../../store/model";
import { countSnapshotsForEntries, deleteSnapshotsForEntries } from "../../store/db";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Delete a client, project, task or subtask after a warning that lists exactly what goes with it:
 * the items inside, every clocking on them and the screenshots taken during those clockings.
 * Returns `ask(item, { confirmLabel, after })`.
 */
export function useDeleteItem() {
  const { allIndex: index, teamEntries, actions } = useStore();
  const { confirm, toast } = useDialogs();

  return async (item, { confirmLabel = "Delete", after } = {}) => {
    const ids = new Set(descendants(index, item.id).map((x) => x.id));
    const inside = ids.size - 1;
    const entries = teamEntries.filter((e) => ids.has(e.subtaskId));
    const entryIds = entries.map((e) => e.id);
    const people = new Set(entries.map((e) => e.memberId)).size;
    const seconds = entries.reduce((s, e) => s + entrySeconds(e, Date.now()), 0);
    let shots = 0;
    try {
      shots = entryIds.length ? await countSnapshotsForEntries(entryIds) : 0;
    } catch {
      shots = -1; // couldn't count; still warn
    }
    const label = TYPE_LABEL[item.type].toLowerCase();

    confirm({
      title: `Delete ${label}?`,
      confirmLabel,
      danger: true,
      message: (
        <>
          <p>
            “{item.name}” will be permanently deleted{entryIds.length || inside ? ", along with:" : "."}
          </p>
          {(inside > 0 || entryIds.length > 0) && (
            <ul className="mt-3 space-y-2 rounded-2xl bg-red-50 p-3 text-red-800">
              {inside > 0 && (
                <li className="flex items-center gap-2">
                  <FolderTree className="size-4 shrink-0" /> {plural(inside, "item")} inside it
                </li>
              )}
              {entryIds.length > 0 && (
                <li className="flex items-center gap-2">
                  <Clock className="size-4 shrink-0" />
                  <span>
                    <b>{plural(entryIds.length, "clocking")}</b> ({formatHours(seconds)}{people > 1 ? ` by ${people} people` : ""})
                  </span>
                </li>
              )}
              {entryIds.length > 0 && (
                <li className="flex items-center gap-2">
                  <Camera className="size-4 shrink-0" />
                  <span>{shots < 0 ? <b>All screenshots taken during those clockings</b> : <b>{plural(shots, "screenshot")}</b>}</span>
                </li>
              )}
            </ul>
          )}
          {entryIds.length > 0 && (
            <p className="mt-3 flex items-start gap-2 font-semibold text-stone-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
              This time disappears from timesheets, reports and client hours. It can't be undone.
            </p>
          )}
        </>
      ),
      onConfirm: async () => {
        try {
          if (entryIds.length) await deleteSnapshotsForEntries(entryIds);
        } catch (err) {
          toast(`Couldn't delete the screenshots, so nothing was deleted: ${err.message ?? err}`, "error");
          return;
        }
        actions.deleteItem(item.id);
        after?.();
        toast(`${TYPE_LABEL[item.type]} deleted`);
      },
    });
  };
}
