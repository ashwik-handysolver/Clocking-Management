import { useMemo, useState } from "react";
import {
  Archive, ArrowLeft, KeyRound, Mail, Pencil, Plus, Trash, UserRound,
} from "lucide-react";
import { navigate, openItem } from "../../lib/router";
import { shortDate } from "../../lib/time";
import {
  TYPE_LABEL, ancestry, descendants, isDone, rollupSeconds,
} from "../../store/model";
import { canArchive, canCreate, canDeleteItem, canEditDetails, isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { TYPE_ICON } from "../ItemForm";
import { Avatar, Button, Card, cx } from "../ui";
import { DoneName } from "../motion";
import ChildrenList from "./ChildrenList";
import { RichDescription } from "../Attachments";
import ClientAccessDialog from "../admin/ClientAccessDialog";
import AddWizard from "../AddSubtaskWizard";
import ClientWork from "./ClientWork";
import ItemMenu, { useWorkActions } from "./ItemMenu";
import { useDeleteItem } from "./useDeleteItem";

/**
 * Full page for one item. Clients show their projects as tabs (`projectId` picks a tab);
 * tasks list their subtasks as rows that expand in place.
 */
export default function ItemDetail({ item, projectId = null, billing = "billable", focusSubtaskId = null }) {
  const { entries, teamEntries, index, actions, me, memberById } = useStore();
  const { openItemForm, confirm, toast } = useDialogs();
  // Work with logged time can't be deleted by team members (the database checks everyone's time).
  const hasTime = useMemo(() => {
    const ids = new Set(descendants(index, item.id).map((x) => x.id));
    return teamEntries.some((e) => ids.has(e.subtaskId));
  }, [index, item.id, teamEntries]);
  const isClient = item.type === "client";
  const [accessOpen, setAccessOpen] = useState(false); // the Client access dialog
  const [addingSubtask, setAddingSubtask] = useState(false); // Add subtask, with this task picked

  // Your own time only (store/permissions.js).
  const seconds = useMemo(() => rollupSeconds(index, entries), [index, entries]);
  const Icon = TYPE_ICON[item.type];
  const parent = item.parentId ? index.get(item.parentId) : null;
  const childCount = index.childrenOf(item.id).length;

  const archive = () =>
    confirm({
      title: `Archive ${TYPE_LABEL[item.type].toLowerCase()}?`,
      message: `“${item.name}” and everything in it will be hidden from the team. Its time stays in timesheets and invoices. Restore it any time from Archive.`,
      confirmLabel: "Archive",
      onConfirm: () => {
        actions.archiveItem(item.id);
        item.parentId ? openItem(item.parentId) : navigate("work");
        toast(`${TYPE_LABEL[item.type]} archived`);
      },
    });

  // Warns with the clockings and screenshots that go too.
  const askDelete = useDeleteItem();
  const goUp = () => (item.parentId ? openItem(item.parentId) : navigate("work"));
  const remove = () => askDelete(item, { after: goUp });
  // Tasks get the usual work actions; clients and projects are managed by the admin (edit, client access, archive).
  const workActions = useWorkActions(item.type === "task" || item.type === "subtask" ? item : null, { afterDelete: goUp });
  const menu = workActions.length
    ? workActions
    : [
        { icon: Pencil, label: "Edit", onClick: () => openItemForm({ id: item.id }), hidden: !(canCreate(me, item.type) && canEditDetails(me, item)) },
        { icon: KeyRound, label: "Client access", onClick: () => setAccessOpen(true), hidden: !(isClient && isAdmin(me)) },
        { icon: Archive, label: "Archive", onClick: archive, hidden: !canArchive(me, item) },
        { icon: Trash, label: "Delete", danger: true, onClick: remove, hidden: canArchive(me, item) || !canDeleteItem(me, item, hasTime) },
      ];

  return (
    // @container: everything inside lays out by this view's width, not the screen's.
    <div className="@container space-y-4">
      {accessOpen && <ClientAccessDialog client={item} onClose={() => setAccessOpen(false)} />}
      {addingSubtask && <AddWizard kind="subtask" contextId={item.id} onClose={() => setAddingSubtask(false)} toast={toast} />}
      <Card className="relative overflow-hidden p-2">
        {/* One compact header: title with its type beside it, actions on the same line, path underneath */}
        <div className="relative px-4 pt-4 pb-4 @md:px-5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon={ArrowLeft}
                aria-label="Back"
                title="Back"
                onClick={() => (parent ? openItem(parent.id) : navigate("work"))}
                className="lg:hidden"
              />
              <h1 className={cx("min-w-0 text-xl leading-tight font-extrabold tracking-tight break-words text-stone-900", isDone(item) && "!text-stone-400")}>
                <DoneName item={item}>{item.name}</DoneName>
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-brand-700 uppercase">
                <Icon className="size-3" />
                {TYPE_LABEL[item.type]}
              </span>
              {isClient && (item.contactName || item.contactEmail) && (
                <span className="flex min-w-0 items-center gap-3 text-xs text-stone-500">
                  {item.contactName && (
                    <span className="flex min-w-0 items-center gap-1">
                      <UserRound className="size-3.5 shrink-0 text-stone-400" />
                      <span className="truncate">{item.contactName}</span>
                    </span>
                  )}
                  {item.contactEmail && (
                    <a href={`mailto:${item.contactEmail}`} className="flex min-w-0 items-center gap-1 hover:text-brand-700">
                      <Mail className="size-3.5 shrink-0 text-stone-400" />
                      <span className="truncate">{item.contactEmail}</span>
                    </a>
                  )}
                </span>
              )}
            </div>
            {parent && (
              <button type="button" onClick={() => openItem(parent.id)} className="mt-0.5 block max-w-full truncate text-left text-xs font-medium text-stone-400 hover:text-stone-700">
                in {ancestry(index, parent.id).map((a) => a.name).join(" / ")}
                {item.type === "task" && item.due && <span className="ml-1.5">· Due {shortDate(item.due)}</span>}
              </button>
            )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.type === "task" && (
                <>
                  {canCreate(me, "subtask") && (
                    <Button size="sm" variant="soft" iconOnly icon={Plus} aria-label="Add subtask" title="Add subtask" onClick={() => setAddingSubtask(true)} />
                  )}
                  <span title={`Created by ${memberById.get(item.createdBy)?.name ?? "—"}`}>
                    <Avatar member={memberById.get(item.createdBy)} size="sm" />
                  </span>
                </>
              )}
              <ItemMenu actions={menu} />
            </div>
          </div>
          {item.description && <RichDescription text={item.description} className="mt-2 max-w-2xl leading-relaxed text-stone-500" />}
        </div>

      </Card>

      {isClient && <ClientWork client={item} projectId={projectId} billing={billing} seconds={seconds} />}

      {item.type === "task" && (
        <Card className="p-4 @md:p-5">
          <ChildrenList
            item={item}
            seconds={seconds}
            focusId={focusSubtaskId}
            heading={
              <h2 className="mr-1 flex items-center gap-2 text-base font-extrabold tracking-tight text-stone-900">
                Subtasks
                <span className="rounded-full bg-brand-50 px-2 py-px text-xs font-bold text-brand-700">{childCount}</span>
              </h2>
            }
          />
        </Card>
      )}
    </div>
  );
}

