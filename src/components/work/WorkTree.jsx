import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, SearchX } from "lucide-react";
import { openItem } from "../../lib/router";
import { decimalHours, todayKey } from "../../lib/time";
import { STATUSES, ancestry, assigneesOf, hasAssignee, isDone, isOverdue, isWork, liveItemIds, rollupSeconds } from "../../store/model";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { AvatarStack, Button, Card, EmptyState, IconChip, Listbox, StatusIcon, cx } from "../ui";

function FilterSelect({ label, value, onChange, options }) {
  const on = value !== "all";
  return (
    <Listbox
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      triggerClass="flex-1 basis-0"
      renderTrigger={({ open, current }) => (
        <span
          className={cx(
            "flex h-8 w-full items-center gap-1 rounded-full px-3 text-xs font-semibold transition",
            on ? "bg-brand-100 text-brand-700" : "bg-stone-100 text-stone-600 hover:bg-stone-200/70",
            open && "ring-2 ring-brand-500/40",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{current?.label}</span>
          <ChevronDown className={cx("size-3.5 shrink-0 opacity-60 transition", open && "rotate-180")} strokeWidth={2.75} />
        </span>
      )}
    />
  );
}

function RowIcon({ item, selected }) {
  if (item.type === "client")
    return (
      <span className={cx("grid size-7 shrink-0 place-items-center rounded-xl text-xs font-extrabold", selected ? "bg-brand-500 text-white" : "bg-brand-100 text-brand-700")}>
        {item.name[0]}
      </span>
    );
  if (item.type === "project")
    return (
      <span className={cx("grid size-7 shrink-0 place-items-center rounded-xl", selected ? "bg-brand-500 text-white" : "bg-stone-100 text-stone-500")}>
        <Folder className="size-3.5" />
      </span>
    );
  return (
    <span className="grid size-7 shrink-0 place-items-center">
      <StatusIcon status={item.status} className={item.type === "task" ? "size-[18px]" : "size-4"} />
    </span>
  );
}

/** Narrow strip shown in place of the tree when it's hidden (desktop only). */
export function WorkTreeRail({ onShow }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-2 py-4">
      <button
        type="button"
        onClick={onShow}
        title="Show panel"
        aria-label="Show work panel"
        className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow transition hover:scale-105"
      >
        <PanelLeftOpen className="size-5" />
      </button>
      <span className="text-[11px] font-extrabold tracking-widest text-stone-400 uppercase [writing-mode:vertical-rl]">Work</span>
    </Card>
  );
}

export default function WorkTree({ selectedId, onHide }) {
  const { state, items, index, memberById, me, entries } = useStore();
  const { openItemForm } = useDialogs();
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState("all");
  const [collapsed, setCollapsed] = useState(() => new Set());

  // Only the signed-in user's own time (see store/permissions.js).
  const seconds = useMemo(() => rollupSeconds(index, entries), [index, entries]);
  const live = useMemo(() => liveItemIds(index, entries), [index, entries]);
  const selectedPath = useMemo(() => new Set(ancestry(index, selectedId).map((x) => x.id)), [index, selectedId]);

  // When the selection changes (e.g. from search), make sure its parents are expanded.
  useEffect(() => {
    setCollapsed((prev) => {
      if (![...selectedPath].some((id) => prev.has(id) && id !== selectedId)) return prev;
      const next = new Set(prev);
      selectedPath.forEach((id) => id !== selectedId && next.delete(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const q = query.trim().toLowerCase();
  const filtersOn = assignee !== "all" || status !== "all";
  const today = todayKey();

  // An item shows if it matches (text + filters), is selected, or anything beneath it matches.
  const visible = useMemo(() => {
    const textMatch = (item) => !q || item.name.toLowerCase().includes(q) || (item.tags ?? []).some((t) => t.toLowerCase().includes(q));
    const passesFilters = (item) => {
      if (!filtersOn) return true;
      if (!isWork(item)) return false;
      // Only subtasks have an assignee; a task shows when one of its subtasks matches.
      if (assignee !== "all" && !assigneesOf(item).includes(assignee === "me" ? me.id : assignee)) return false;
      if (status === "open") return !isDone(item);
      if (status === "overdue") return isOverdue(item, today);
      return status === "all" || item.status === status;
    };
    const memo = new Map();
    const check = (item) => {
      const childHit = index.childrenOf(item.id).map(check).some(Boolean);
      const result = (textMatch(item) && passesFilters(item)) || item.id === selectedId || childHit;
      memo.set(item.id, result);
      return result;
    };
    index.childrenOf(null).forEach(check);
    return memo;
  }, [index, q, assignee, status, filtersOn, me.id, today, selectedId]);

  // Only clients expand: projects are labels and subtasks live on their task's page.
  const parentIds = items.filter((i) => i.type === "client" && index.childrenOf(i.id).length).map((i) => i.id);
  const allCollapsed = parentIds.length > 0 && parentIds.every((id) => collapsed.has(id));
  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // A client's tasks, flattened across its projects. With several projects, each gets a small label.
  const renderClientTasks = (clientId) => {
    const projects = index.childrenOf(clientId).filter((p) => visible.get(p.id));
    return projects.flatMap((p) => {
      const tasks = renderRows(p.id);
      if (projects.length < 2) return tasks;
      const selected = p.id === selectedId;
      return [
        <li key={`label-${p.id}`} role="none">
          <button
            type="button"
            onClick={() => openItem(p.id)}
            className={cx(
              "mt-1.5 mb-0.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[10px] font-extrabold tracking-widest uppercase transition",
              selected ? "text-brand-600" : "text-stone-400 hover:text-stone-700",
            )}
          >
            <Folder className="size-3" />
            <span className="truncate">{p.name}</span>
          </button>
        </li>,
        ...tasks,
      ];
    });
  };

  const renderRows = (parentId) =>
    index
      .childrenOf(parentId)
      .filter((item) => visible.get(item.id))
      .map((item) => {
        const isClient = item.type === "client";
        const kids = isClient ? index.childrenOf(item.id).filter((c) => visible.get(c.id)) : [];
        const open = kids.length > 0 && (q || filtersOn || !collapsed.has(item.id));
        const selected = item.id === selectedId;
        const secs = seconds.get(item.id) ?? 0;

        return (
          <li key={item.id} role="treeitem" aria-selected={selected} aria-expanded={kids.length ? Boolean(open) : undefined}>
            <div
              onClick={() => openItem(item.id)}
              className={cx(
                "group relative flex h-11 cursor-pointer items-center gap-2 rounded-2xl pr-2 pl-1 transition",
                selected ? "bg-brand-50 shadow-[inset_0_0_0_1px] shadow-brand-200" : "hover:bg-stone-50",
              )}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label={open ? "Collapse" : "Expand"}
                onClick={(e) => {
                  e.stopPropagation();
                  kids.length && toggle(item.id);
                }}
                className={cx("grid size-6 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-200/70 hover:text-stone-700", !kids.length && "invisible")}
              >
                <ChevronRight className={cx("size-3.5 transition-transform duration-200", open && "rotate-90")} />
              </button>
              <RowIcon item={item} selected={selected} />
              <span
                className={cx(
                  "min-w-0 flex-1 truncate text-[13px]",
                  item.type === "client" || item.type === "project" ? "font-bold text-stone-900" : item.type === "task" ? "font-semibold text-stone-800" : "text-stone-600",
                  selected && "!text-brand-700",
                  isDone(item) && "!font-medium !text-stone-400 line-through decoration-stone-300",
                )}
              >
                {item.name}
              </span>
              {live.has(item.id) && <span title="You're clocked in here" className="size-2 shrink-0 animate-pulse-dot rounded-full bg-emerald-500" />}
              {isOverdue(item, today) && <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-600">Late</span>}
              {secs > 0 && <span className="shrink-0 text-[11px] font-medium text-stone-400 tabular-nums">{decimalHours(secs)}h</span>}
              {hasAssignee(item) && (
                <AvatarStack members={assigneesOf(item).map((id) => memberById.get(id)).filter(Boolean)} max={2} size="xs" />
              )}
            </div>
            {open && (
              <ul role="group" className="ml-[19px] border-l border-dashed border-stone-200 pl-2">
                {renderClientTasks(item.id)}
              </ul>
            )}
          </li>
        );
      });

  const hasRows = index.childrenOf(null).some((c) => visible.get(c.id));
  const counts = { clients: index.childrenOf(null).length, projects: items.filter((i) => i.type === "project").length };

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <IconChip icon={Network} tone="brand" />
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-stone-900">Work</h2>
            <p className="text-xs text-stone-400">
              {counts.clients} clients · {counts.projects} projects
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={allCollapsed ? ChevronsUpDown : ChevronsDownUp}
            title={allCollapsed ? "Expand all" : "Collapse all"}
            aria-label={allCollapsed ? "Expand all" : "Collapse all"}
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parentIds))}
          />
          {isAdmin(me) && (
            <Button variant="soft" size="sm" icon={Plus} onClick={() => openItemForm({ type: "client", lockType: true })}>
              Client
            </Button>
          )}
          {onHide && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={PanelLeftClose}
              title="Hide panel"
              aria-label="Hide work panel"
              onClick={onHide}
              className="hidden lg:inline-flex"
            />
          )}
        </div>
      </div>

      <div className="space-y-2 px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or tag…"
            className="h-10 w-full rounded-2xl bg-stone-100 pr-3 pl-10 text-sm outline-none placeholder:text-stone-400 focus:bg-surface focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-2">
          <FilterSelect
            label="Filter by assignee"
            value={assignee}
            onChange={setAssignee}
            options={[{ value: "all", label: "Everyone" }, { value: "me", label: "Assigned to me" }, ...state.members.map((m) => ({ value: m.id, label: m.name }))]}
          />
          <FilterSelect
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={[{ value: "all", label: "Any status" }, { value: "open", label: "Open work" }, { value: "overdue", label: "Overdue" }, ...STATUSES]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-stone-100 px-2 py-2 scrollbar-thin">
        {hasRows ? (
          <ul role="tree" aria-label="Clients and work">
            {renderRows(null)}
          </ul>
        ) : items.length ? (
          <EmptyState
            icon={SearchX}
            title="Nothing matches"
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQuery("");
                  setAssignee("all");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Plus}
            title="No clients yet"
            action={
              isAdmin(me) && (
                <Button variant="primary" size="sm" icon={Plus} onClick={() => openItemForm({ type: "client", lockType: true })}>
                  Add client
                </Button>
              )
            }
          />
        )}
      </div>
    </Card>
  );
}
