import { Archive, BadgeDollarSign, CircleSlash, Folder, Pencil } from "lucide-react";
import { navigate, openItem } from "../../lib/router";
import { BILLING, BILLING_LABEL, billingOf, progressOf } from "../../store/model";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Button, Card, EmptyState, ProgressRing, ADD_HINT, cx } from "../ui";
import ChildrenList from "./ChildrenList";

/*
 * A client's work on one page: projects are tabs, not another level to click into.
 * "All" lists every project's tasks under a small heading; a project tab shows that project's
 * progress and tasks. Project links (#/work/<projectId>) open this page on that tab.
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

  const tab = (id, label, count) => {
    const active = (id ?? null) === (project?.id ?? null);
    return (
      <button
        key={id ?? "all"}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => go(id ?? client.id, billing)}
        className={cx(
          "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-bold whitespace-nowrap transition",
          active ? "bg-brand-500 text-white shadow-glow" : "bg-stone-100 text-stone-600 hover:bg-stone-200/70",
        )}
      >
        {id && <Folder className="size-3.5" />}
        {label}
        <span className={cx("rounded-full px-1.5 text-[11px]", active ? "bg-white/25" : "bg-surface text-stone-500")}>{count}</span>
      </button>
    );
  };

  return (
    <Card className="p-4 @md:p-5">
      <div role="tablist" aria-label="Projects" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin">
        {projects.length > 1 && tab(null, "All projects", projects.length)}
        {projects.map((p) => tab(p.id, p.name, tasksIn(p).length))}
      </div>

      {!projects.length ? (
        <EmptyState icon={Folder} title="No projects yet" text={admin ? ADD_HINT : undefined} />
      ) : project || projects.length === 1 ? (
        <ProjectSection project={project ?? projects[0]} billing={billing} onBilling={showBilling} seconds={seconds} admin={admin} onArchive={archiveProject} />
      ) : (
        <div className="space-y-6">
          <BillingSwitch value={billing} onChange={showBilling} />
          {projects.map((p) => (
            <section key={p.id}>
              <button type="button" onClick={() => openItem(p.id)} className="mb-2 flex items-center gap-2 text-xs font-extrabold tracking-widest text-stone-400 uppercase hover:text-brand-600">
                <Folder className="size-3.5" /> {p.name}
              </button>
              <ChildrenList item={p} billing={billing} seconds={seconds} />
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

/** One project's progress and tasks. */
function ProjectSection({ project, billing, onBilling, seconds, admin, onArchive }) {
  const { index } = useStore();
  const { openItemForm } = useDialogs();
  const prog = progressOf(index, project.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-stone-50 px-3 py-2.5">
        <ProgressRing value={prog.pct} tone="green" size={36} stroke={4} />
        <span className="text-xs text-stone-400">
          {prog.done}/{prog.total} done
        </span>
        {admin && (
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openItemForm({ id: project.id })}>
              Edit project
            </Button>
            <Button size="sm" variant="ghost" iconOnly icon={Archive} aria-label="Archive project" title="Archive project" onClick={() => onArchive(project)} />
          </span>
        )}
      </div>
      {project.description && <p className="px-1 text-sm text-stone-500">{project.description}</p>}
      <BillingSwitch value={billing} onChange={onBilling} />
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
