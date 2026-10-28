import { useMemo } from "react";
import { ArrowUpRight, Building, Clock, Folder, Plus, TriangleAlert, Users } from "lucide-react";
import { openItem } from "../../lib/router";
import { formatHours, todayKey } from "../../lib/time";
import { assigneesOf, descendants, isOverdue, liveItemIds, progressOf, rollupSeconds } from "../../store/model";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { AvatarStack, Button, Card, EmptyState, IconChip, ProgressRing, Watermark } from "../ui";

/** Shown on the right when nothing is selected: one card per client. */
export default function WorkOverview() {
  const { index, memberById, entries, me } = useStore();
  const { openItemForm } = useDialogs();
  // Your own time only.
  const seconds = useMemo(() => rollupSeconds(index, entries), [index, entries]);
  const live = useMemo(() => liveItemIds(index, entries), [index, entries]);
  const clients = index.childrenOf(null);
  const today = todayKey();

  if (!clients.length) {
    return (
      <Card>
        <EmptyState
          icon={Building}
          title="Start by adding a client"
          action={
            isAdmin(me) && (
              <Button variant="primary" icon={Plus} onClick={() => openItemForm({ type: "client", lockType: true })}>
                Add client
              </Button>
            )
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <IconChip icon={Building} tone="brand" />
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-stone-900">Clients</h2>
          </div>
        </div>
        {isAdmin(me) && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => openItemForm({ type: "client", lockType: true })}>
            Client
          </Button>
        )}
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        {clients.map((c) => {
          const prog = progressOf(index, c.id);
          const all = descendants(index, c.id);
          const projects = index.childrenOf(c.id);
          const overdue = all.filter((x) => isOverdue(x, today)).length;
          const people = [...new Set(all.flatMap(assigneesOf))].map((id) => memberById.get(id)).filter(Boolean);
          return (
            <Card key={c.id} className="group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-float">
              {/* Decorative header band */}
              <div className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-brand-50/60 to-surface px-5 pt-5 pb-4">
                <div className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-brand-100/60" />
                <Watermark icon={Building} tone="brand" className="!-right-2 !-bottom-10 !size-28" />
                <div className="relative flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-extrabold text-white shadow-glow">
                    {c.name[0]}
                  </span>
                  <button type="button" onClick={() => openItem(c.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-base font-extrabold text-stone-900 group-hover:text-brand-700">{c.name}</span>
                      {live.has(c.id) && <span title="You're clocked in here" className="size-2 animate-pulse-dot rounded-full bg-emerald-500" />}
                    </span>
                    <span className="block truncate text-xs text-stone-500">{c.contactName ? `${c.contactName} · ${c.contactEmail}` : c.description}</span>
                  </button>
                  <span className="rounded-full bg-surface shadow-sm">
                    <ProgressRing value={prog.pct} tone="green" size={48} />
                  </span>
                </div>
              </div>

              <ul className="space-y-1.5 px-5 pt-4">
                {projects.map((p) => {
                  const pp = progressOf(index, p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => openItem(p.id)} className="flex w-full items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2.5 text-left transition hover:bg-brand-50">
                        <IconChip icon={Folder} tone="brand" variant="soft" size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
                            <span className="truncate">{p.name}</span>
                            {live.has(p.id) && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />}
                          </span>
                          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-stone-200/70">
                            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pp.pct}%` }} />
                          </span>
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs leading-tight">
                          <span className="block font-bold text-stone-700 tabular-nums">{formatHours(seconds.get(p.id) ?? 0)}</span>
                          <span className="text-stone-400">{pp.done}/{pp.total} done</span>
                        </span>
                        <ArrowUpRight className="size-4 shrink-0 text-stone-300" />
                      </button>
                    </li>
                  );
                })}
                {!projects.length && <li className="rounded-2xl bg-stone-50 px-3 py-3 text-xs text-stone-400">No projects yet</li>}
              </ul>

              <div className="mt-auto flex items-center justify-between gap-2 px-5 pt-4 pb-5 text-xs text-stone-500">
                <span className="flex flex-wrap items-center gap-2">
                  <span title="Your time on this client" className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-700">
                    <Clock className="size-3.5 text-brand-500" />
                    {formatHours(seconds.get(c.id) ?? 0)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-700">
                    <Users className="size-3.5 text-brand-500" />
                    {people.length}
                  </span>
                  {overdue > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-bold text-red-600">
                      <TriangleAlert className="size-3.5" />
                      {overdue} overdue
                    </span>
                  )}
                </span>
                <AvatarStack members={people} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
