import { useMemo } from "react";
import { Archive, ArchiveRestore, Building, Folder, Trash } from "lucide-react";
import { formatHours } from "../../lib/time";
import { descendants, pathLabel, rollupSeconds } from "../../store/model";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Button, Card, EmptyState } from "../ui";
import { AdminPage } from "./AdminPage";

/** Archived clients and projects (admin): restore them, or delete them for good. */
export default function ArchivePage() {
  const { allIndex: index, teamEntries, actions } = useStore();
  const { confirm, toast } = useDialogs();
  const seconds = useMemo(() => rollupSeconds(index, teamEntries), [index, teamEntries]);
  // Only the top archived item: a project inside an archived client goes with its client.
  const archived = [...index.byId.values()]
    .filter((i) => i.archived && !(i.parentId && index.get(i.parentId)?.archived))
    .sort((a, b) => a.name.localeCompare(b.name));

  const restore = (item) => {
    actions.archiveItem(item.id, false);
    toast(`${item.name} restored`);
  };
  const destroy = (item) => {
    const inside = descendants(index, item.id).length - 1;
    confirm({
      title: `Delete ${item.type} permanently?`,
      message: `“${item.name}”${inside ? ` and ${inside} item${inside > 1 ? "s" : ""} inside it` : ""} will be deleted for good, along with ${formatHours(seconds.get(item.id) ?? 0)} of logged time. This can't be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: () => {
        actions.deleteItem(item.id);
        toast(`${item.name} deleted`);
      },
    });
  };

  return (
    <AdminPage title="Archive">
      <Card className="p-4 @md:p-5">
        {!archived.length ? (
          <EmptyState icon={Archive} title="Nothing archived" />
        ) : (
          <ul className="divide-y divide-stone-100">
            {archived.map((item) => {
              const Icon = item.type === "client" ? Building : Folder;
              const inside = descendants(index, item.id).length - 1;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-800">{item.name}</p>
                    <p className="truncate text-xs text-stone-400">
                      {item.type === "client" ? "Client" : `Project in ${pathLabel(index, item.id)}`} · {inside} item{inside === 1 ? "" : "s"} ·{" "}
                      {formatHours(seconds.get(item.id) ?? 0)} logged
                    </p>
                  </div>
                  <span className="flex gap-1">
                    <Button size="sm" variant="soft" icon={ArchiveRestore} onClick={() => restore(item)}>
                      Restore
                    </Button>
                    <Button size="sm" variant="dangerGhost" iconOnly icon={Trash} aria-label={`Delete ${item.name} permanently`} title="Delete permanently" onClick={() => destroy(item)} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AdminPage>
  );
}
