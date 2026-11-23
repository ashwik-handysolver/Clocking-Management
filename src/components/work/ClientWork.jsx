import { useState } from "react";
import { Archive, BadgeDollarSign, ChevronDown, CircleSlash, Folder, Pencil } from "lucide-react";
import { navigate } from "../../lib/router";
import { BILLING, BILLING_LABEL, billingOf, progressOf } from "../../store/model";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Button, Card, EmptyState, ProgressRing, Select, ADD_HINT, cx } from "../ui";
import { Collapse } from "../motion";
import ChildrenList from "./ChildrenList";
import ItemMenu from "./ItemMenu";

/*
 * A client's work on one page. One toolbar row: which project (a dropdown) and billable /
 * non-billable. "All projects" lists each project as a tile, collapsed until opened; a project
 * with no tasks in this category just says so. Picking a project shows its progress and tasks.
 * Project links (#/work/<projectId>) open this page with that project picked.
 */
export default function ClientWork({ client, projectId, billing = "billable", seconds }) {
  const { index, actions } = useStore();
  const { confirm, toast } = useDialogs();
  const { me } = useStore();
  const admin = isAdmin(me); // only the admin adds projects
  const projects = index.childrenOf(client.id);
  const project = projectId ? index.get(projectId) : null;
  // The switch picks which tasks show (?billing= in the URL); new tasks go into that category.
  const tasksIn = (p) => index.childrenOf(p.id).filter((t) => billingOf(index, t.id) === billing);
  const go = (id, b) => navigate("work", id, b === "billable" ? null : { billing: b });
  const showBilling = (b) => go(project?.id ?? client.id, b);

  // The admin archives projects instead of deleting them (permanent delete lives on the Archive page).
  const archiveProject = (p) =>
    confirm({
      title: "Archive project?",
      message: `“${p.name}” and its tasks will be hidden from the team. Its time stays in timesheets and invoices. Restore it any time from Archive.`,
      confirmLabel: "Archive",
      onConfirm: () => {
        actions.archiveItem(p.id);
        go(client.id, billing);
        toast("Project archived");
      },
    });

  const single = project ?? (projects.length === 1 ? projects[0] : null);

  return (
    <Card className="p-4 @md:p-5">
      {projects.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {projects.length > 1 ? (
            <div className="w-full sm:w-64">
              <Select
                aria-label="Project"
                value={project?.id ?? ""}
                onChange={(e) => go(e.target.value || client.id, billing)}
                options={[{ value: "", label: `All projects (${projects.length})` }, ...projects.map((p) => ({ value: p.id, label: `${p.name} (${tasksIn(p).length})` }))]}
                className="!h-9"
              />
            </div>
          ) : (
            <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-stone-900">
              <Folder className="size-4 text-stone-400" /> {projects[0].name}
            </h2>
          )}
          <span className="flex-1" />
          <BillingSwitch value={billing} onChange={showBilling} />
        </div>
      )}

      {!projects.length ? (
        <EmptyState icon={Folder} title="No projects yet" text={admin ? ADD_HINT : undefined} />
      ) : single ? (
        <ProjectSection project={single} billing={billing} seconds={seconds} admin={admin} onArchive={archiveProject} />
      ) : (
        <div className="divide-y divide-stone-100">
          {projects.map((p) => (
            <ProjectTile key={p.id} project={p} tasks={tasksIn(p).length} billing={billing} seconds={seconds} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** A project on "All projects": collapsed to one row until opened. Empty ones just say so. */
function ProjectTile({ project, tasks, billing, seconds }) {
  const [open, setOpen] = useState(false);
  const empty = tasks === 0;
  return (
    <section>
      <button
        type="button"
        onClick={() => !empty && setOpen((v) => !v)}
        aria-expanded={empty ? undefined : open}
        disabled={empty}
        className={cx("flex w-full items-center gap-3 px-2 py-3 text-left transition-colors", empty ? "cursor-default" : "hover:bg-stone-50")}
      >
        <Folder className="size-4 shrink-0 text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-stone-800">{project.name}</span>
        {empty ? (
          <span className="text-xs text-stone-400">No {BILLING_LABEL[billing].toLowerCase()} tasks</span>
        ) : (
          <>
            <span className="text-xs text-stone-500 tabular-nums">
              {tasks} {tasks === 1 ? "task" : "tasks"}
            </span>
            <ChevronDown className={cx("size-4 shrink-0 text-stone-400 transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      {!empty && (
        <Collapse open={open}>
          <div className="pb-3 pl-7">{open && <ChildrenList item={project} billing={billing} seconds={seconds} />}</div>
        </Collapse>
      )}
    </section>
  );
}

/** One project's progress and tasks. */
function ProjectSection({ project, billing, seconds, admin, onArchive }) {
  const { index } = useStore();
  const { openItemForm } = useDialogs();
  const prog = progressOf(index, project.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ProgressRing value={prog.pct} tone="green" size={36} stroke={4} />
        <span className="text-xs text-stone-400">
          {prog.done}/{prog.total} done
        </span>
        {admin && (
          <ItemMenu
            label="Project actions"
            className="ml-auto"
            actions={[
              { icon: Pencil, label: "Edit project", onClick: () => openItemForm({ id: project.id }) },
              { icon: Archive, label: "Archive project", onClick: () => onArchive(project) },
            ]}
          />
        )}
      </div>
      {project.description && <p className="px-1 text-sm text-stone-500">{project.description}</p>}
      <ChildrenList item={project} billing={billing} seconds={seconds} />
    </div>
  );
}

/** Billable / Non-billable: which of a project's tasks show, and where new ones go. */
function BillingSwitch({ value, onChange }) {
  return (
    <div role="group" aria-label="Billing" className="inline-flex rounded-full bg-stone-100 p-1">
      {BILLING.map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={value === b}
          onClick={() => onChange(b)}
          className={cx(
            "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition",
            value === b ? "bg-surface text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
          )}
        >
          {b === "billable" ? <BadgeDollarSign className="size-3.5" /> : <CircleSlash className="size-3.5" />}
          {BILLING_LABEL[b]}
        </button>
      ))}
    </div>
  );
}
