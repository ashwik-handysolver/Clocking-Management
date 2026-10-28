import { useMemo, useState } from "react";
import { BadgeDollarSign, ChevronDown, CircleSlash, Clock, Download, FileBarChart, Folder, Users } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { openItem } from "../../lib/router";
import { addDays, decimalHours, formatHours, formatTime, fromDateKey, startOfWeek, toDateKey } from "../../lib/time";
import { BILLING_LABEL, ancestry, entryBilling, entrySeconds, workingMembers } from "../../store/model";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Avatar, AvatarStack, Button, Card, EmptyState, Field, IconChip, Modal, Select, cx, inputClass } from "../ui";
import { AdminPage, Segmented } from "./AdminPage";

/*
 * Reports (admin): who worked how long on what, for a client, billing type, member and period.
 * Breaks down by team member (â†’ their tasks) or by project (â†’ tasks).
 * The CSV export carries billable hours only; non-billable time is shown on screen, never exported.
 */

export default function Reports() {
  return (
    <AdminPage title="Reports">
      <Report />
    </AdminPage>
  );
}

/* ---------- Filters and data ---------- */

const PERIODS = [
  ["week", "This week"],
  ["month", "This month"],
  ["last", "Last month"],
  ["custom", "Custom"],
];

function periodRange(period, custom, now) {
  const d = new Date(now);
  if (period === "week") return [toDateKey(startOfWeek(now)), toDateKey(addDays(startOfWeek(now), 6))];
  if (period === "month") return [toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)), toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  if (period === "last") return [toDateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)), toDateKey(new Date(d.getFullYear(), d.getMonth(), 0))];
  return custom;
}

/** One row per clocking that matches the filters, with everything the report and CSV need. */
function useReportLines({ clientId, billing, memberId, fromKey, toKey, now }) {
  const { teamEntries, allIndex: index, memberById } = useStore();
  return useMemo(() => {
    const from = fromDateKey(fromKey);
    const to = fromDateKey(toKey) + 86_400_000; // through the end of the last day
    return teamEntries
      .filter((e) => e.start >= from && e.start < to)
      .filter((e) => !memberId || e.memberId === memberId)
      .map((e) => {
        const chain = ancestry(index, e.subtaskId);
        const client = chain.find((x) => x.type === "client");
        if (clientId && client?.id !== clientId) return null;
        const b = entryBilling(index, e);
        if (billing !== "all" && b !== billing) return null;
        return {
          e, member: memberById.get(e.memberId), secs: entrySeconds(e, now), billing: b,
          client, project: chain.find((x) => x.type === "project"), task: chain.find((x) => x.type === "task"), subtask: chain.find((x) => x.type === "subtask"),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.e.start - b.e.start);
  }, [teamEntries, index, memberById, clientId, billing, memberId, fromKey, toKey, now]);
}

/** Totals for a set of lines. */
function totals(lines) {
  let secs = 0, billable = 0;
  for (const l of lines) {
    secs += l.secs;
    if (l.billing === "billable") billable += l.secs;
  }
  return { secs, billable, non: secs - billable, count: lines.length };
}

/** Group lines by a key, keeping each group's lines. Sorted by hours, largest first. */
function group(lines, keyOf, itemOf) {
  const map = new Map();
  for (const l of lines) {
    const k = keyOf(l) ?? "none";
    if (!map.has(k)) map.set(k, { key: k, item: itemOf(l), lines: [] });
    map.get(k).lines.push(l);
  }
  return [...map.values()].map((g) => ({ ...g, ...totals(g.lines) })).sort((a, b) => b.secs - a.secs);
}

/* ---------- Export picker ---------- */

/** Every column the detail table can show. `on` = ticked by default. */
const EXPORT_COLUMNS = [
  { key: "date", label: "Date", on: true, value: (l) => toDateKey(l.e.start) },
  { key: "time", label: "Time", value: (l) => `${formatTime(l.e.start)} - ${l.e.end ? formatTime(l.e.end) : "running"}` },
  { key: "member", label: "Team member", on: true, value: (l) => l.member?.name ?? "" },
  { key: "client", label: "Client", value: (l) => l.client?.name ?? "" },
  { key: "project", label: "Project", value: (l) => l.project?.name ?? "" },
  { key: "task", label: "Task", value: (l) => l.task?.name ?? "" },
  { key: "subtask", label: "Subtask", value: (l) => l.subtask?.name ?? "" },
  { key: "hours", label: "Hours", on: true, value: (l) => formatHours(l.secs) },
  { key: "note", label: "Note", value: (l) => l.e.note ?? "" },
];

/** Lets the admin pick which columns go into the PDF's detail table. */
function ExportPicker({ count, onClose, onExport }) {
  const [selected, setSelected] = useState(() => new Set(EXPORT_COLUMNS.filter((c) => c.on).map((c) => c.key)));
  const all = selected.size === EXPORT_COLUMNS.length;
  const toggle = (key) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const box = "size-4 accent-brand-600";
  return (
    <Modal
      title="Choose columns"
      subtitle={`${selected.size} of ${EXPORT_COLUMNS.length} columns · ${count} billable ${count === 1 ? "row" : "rows"}`}
      icon={Download}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Download} disabled={!selected.size} onClick={() => onExport(EXPORT_COLUMNS.filter((c) => selected.has(c.key)))}>
            Download PDF
          </Button>
        </>
      }
    >
      <label className="mb-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold text-stone-800 hover:bg-stone-50">
        <input
          type="checkbox"
          checked={all}
          ref={(el) => el && (el.indeterminate = !all && selected.size > 0)}
          onChange={() => setSelected(all ? new Set() : new Set(EXPORT_COLUMNS.map((c) => c.key)))}
          className={box}
        />
        All columns
      </label>
      <div className="grid grid-cols-2 gap-1 border-t border-stone-100 pt-2 sm:grid-cols-3">
        {EXPORT_COLUMNS.map((c) => (
          <label key={c.key} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} className={box} />
            {c.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- Report ---------- */

function Report() {
  const { state, teamEntries } = useStore();
  const { toast } = useDialogs();
  const now = useNow(true, 60_000); // running timers count up to now
  const clients = state.items.filter((i) => i.type === "client").sort((a, b) => a.name.localeCompare(b.name));
  const team = workingMembers(state.members, state.items, teamEntries);

  const [clientId, setClientId] = useState("");
  const [billing, setBilling] = useState("all");
  const [memberId, setMemberId] = useState("");
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState(() => periodRange("month", null, Date.now()));
  const [by, setBy] = useState("member");
  const [fromKey, toKey] = periodRange(period, custom, now);

  const lines = useReportLines({ clientId, billing, memberId, fromKey, toKey, now });
  const sum = totals(lines);
  const client = clients.find((c) => c.id === clientId);
  const member = team.find((m) => m.id === memberId);

  // The export is for sharing (e.g. with the client): billable hours only. Non-billable stays on screen.
  const billableLines = lines.filter((l) => l.billing === "billable");
  const [picking, setPicking] = useState(false);
  const exportPdf = async (columns) => {
    const rows = billableLines;
    // Loaded on demand so the PDF library isn't part of every page load.
    const [{ jsPDF }, tables] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    (tables.applyPlugin ?? tables.default.applyPlugin)(jsPDF); // adds doc.autoTable()
    const autoTable = (doc, options) => doc.autoTable(options);
    const total = totals(rows).secs;
    const projects = [...new Set(rows.map((l) => l.project?.name).filter(Boolean))].sort();
    // Date range = first and last day actually worked in the exported rows (rows are sorted by start).
    const firstDay = toDateKey(rows[0].e.start);
    const lastDay = toDateKey(rows[rows.length - 1].e.start);
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const brand = [235, 104, 52];
    const width = doc.internal.pageSize.getWidth() - 80;

    doc.setFont("helvetica", "bold").setFontSize(18).text("Billable hours report", 40, 50);
    doc.setFontSize(10).setTextColor(90);
    let y = 74;
    for (const [label, value] of [
      ["Client", client?.name ?? "All clients"],
      ["Date range", firstDay === lastDay ? firstDay : `${firstDay} to ${lastDay}`],
      ["Project", projects.length ? projects.join(", ") : "None"],
      ["Total", `${formatHours(total)} billable (${decimalHours(total)} h)`],
    ]) {
      doc.setFont("helvetica", "bold").text(`${label}:`, 40, y);
      const wrapped = doc.setFont("helvetica", "normal").splitTextToSize(value, width - 70);
      doc.text(wrapped, 110, y);
      y += 15 * wrapped.length;
    }
    doc.setTextColor(0);

    autoTable(doc, {
      startY: y + 6,
      head: [columns.map((c) => c.label)],
      body: rows.map((l) => columns.map((c) => c.value(l))),
      // Total row under the Hours column (when it's included).
      ...(columns.some((c) => c.key === "hours") && {
        foot: [columns.map((c, i) => (c.key === "hours" ? formatHours(total) : i === 0 ? "Total" : ""))],
        footStyles: { fillColor: [245, 245, 244], textColor: 20 },
        showFoot: "lastPage",
      }),
      headStyles: { fillColor: brand },
      styles: { fontSize: 9, cellPadding: 4 },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        const n = doc.internal.getNumberOfPages();
        doc.setFontSize(8).setTextColor(140).text(`Page ${n}`, doc.internal.pageSize.getWidth() - 70, doc.internal.pageSize.getHeight() - 20);
        doc.setTextColor(0);
      },
    });

    const slug = (s) => s.replace(/[^\w-]+/g, "-").toLowerCase();
    doc.save(`report-${slug(client?.name ?? "all-clients")}${member ? `-${slug(member.name)}` : ""}-${firstDay}-to-${lastDay}.pdf`);
    toast("Report downloaded");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 @md:p-5">
        <div className="grid gap-3 @xl:grid-cols-3">
          <Field label="Client">
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={[{ value: "", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name + (c.archived ? " (archived)" : "") }))]}
            />
          </Field>
          <Field label="Billing type">
            <Select
              value={billing}
              onChange={(e) => setBilling(e.target.value)}
              options={Object.entries(BILLING_FILTER_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Team member">
            <Select value={memberId} onChange={(e) => setMemberId(e.target.value)} options={[{ value: "", label: "Everyone" }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
          {period === "custom" ? (
            <div className="flex gap-2">
              <input type="date" aria-label="From" value={custom[0]} max={custom[1]} onChange={(e) => setCustom(([, b]) => [e.target.value, b])} className={cx(inputClass, "!h-9 w-40 text-sm")} />
              <input type="date" aria-label="To" value={custom[1]} min={custom[0]} onChange={(e) => setCustom(([a]) => [a, e.target.value])} className={cx(inputClass, "!h-9 w-40 text-sm")} />
            </div>
          ) : (
            <span className="pb-2 text-xs text-stone-400">
              {fromKey} to {toKey}
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            onClick={() => setPicking(true)}
            disabled={!billableLines.length}
            title={billableLines.length ? "Billable hours only" : "No billable hours to export"}
            className="ml-auto"
          >
            Download PDF
          </Button>
        </div>
      </Card>
      {picking && (
        <ExportPicker
          count={billableLines.length}
          onClose={() => setPicking(false)}
          onExport={(columns) => {
            setPicking(false);
            exportPdf(columns);
          }}
        />
      )}

      {!lines.length ? (
        <Card>
          <EmptyState icon={FileBarChart} title="No time in this report" />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">
            <Tile icon={Clock} tone="brand" label="Total hours" value={formatHours(sum.secs)} sub={`${sum.count} clocking${sum.count === 1 ? "" : "s"}`} />
            <Tile icon={BadgeDollarSign} tone="violet" label="Billable" value={formatHours(sum.billable)} sub={sum.secs ? `${Math.round((sum.billable / sum.secs) * 100)}% of hours` : ""} />
            <Tile icon={CircleSlash} tone="stone" label="Non-billable" value={formatHours(sum.non)} sub="Shown here only, not exported" />
            <Tile icon={Users} tone="emerald" label="Team members" value={new Set(lines.map((l) => l.member?.id)).size} sub="With time in this report" />
          </div>

          <Card className="p-4 @md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-stone-900">Breakdown</h2>
              <Segmented
                label="Group by"
                value={by}
                onChange={setBy}
                options={[
                  ["member", "By team member"],
                  ["project", "By project"],
                ]}
              />
            </div>
            <Legend />
            {by === "member" ? <ByMember lines={lines} /> : <ByProject lines={lines} showClient={!clientId} />}
          </Card>
        </>
      )}
    </div>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const BILLING_FILTER_LABEL ={ all: "All billing types", billable: "Billable only", "non-billable": "Non-billable only" };

function Tile({ icon, tone, label, value, sub }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <IconChip icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-500">{label}</p>
        <p className="truncate text-2xl font-extrabold tracking-tight text-stone-900 tabular-nums">{value}</p>
        {sub && <p className="truncate text-xs text-stone-500">{sub}</p>}
      </div>
    </Card>
  );
}

function Legend() {
  return (
    <div className="mb-3 flex gap-4 text-xs font-semibold text-stone-500">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-chart-billable" /> Billable
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-chart-non" /> Non-billable
      </span>
    </div>
  );
}

/** Billable / non-billable split as one bar, scaled to `max`. */
function SplitBar({ billable, non, max, title }) {
  return (
    <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-stone-100" title={title}>
      {billable > 0 && <div className="h-full bg-chart-billable" style={{ width: `${(billable / max) * 100}%` }} />}
      {non > 0 && <div className="h-full bg-chart-non" style={{ width: `${(non / max) * 100}%` }} />}
    </div>
  );
}

function BillingTag({ billing }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap",
        billing === "billable" ? "bg-brand-50 text-brand-700" : billing === "mixed" ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-600",
      )}
    >
      {billing === "mixed" ? "Mixed" : BILLING_LABEL[billing]}
    </span>
  );
}

/** "billable", "non-billable", or "mixed" when a group has both. */
const billingOfGroup = (g) => (g.billable && g.non ? "mixed" : g.billable ? "billable" : "non-billable");

/** Numbers column shared by every breakdown row. */
function Figures({ g }) {
  return (
    <span className="flex shrink-0 items-baseline gap-3 text-right tabular-nums">
      <span className="hidden w-28 text-xs whitespace-nowrap text-stone-500 @lg:block">{formatHours(g.billable)} billable</span>
      <span className="w-16 text-sm font-extrabold text-stone-900">{formatHours(g.secs)}</span>    </span>
  );
}

/** Expandable rows: click one to see its tasks. */
function Expandable({ header, children, open, onToggle }) {
  return (
    <li className="py-1">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-stone-50">
        <ChevronDown className={cx("size-4 shrink-0 text-stone-400 transition", !open && "-rotate-90")} />
        {header}
      </button>
      {open && <div className="pb-2 pl-9">{children}</div>}
    </li>
  );
}

const TASKS_SHOWN = 8;

/** Tasks (with their subtasks) inside a group, largest first. */
function TaskList({ lines, showMembers }) {
  const { memberById } = useStore();
  const [all, setAll] = useState(false);
  const tasks = group(lines, (l) => l.task?.id, (l) => l);
  const shown = all ? tasks : tasks.slice(0, TASKS_SHOWN);
  return (
    <ul className="space-y-2 border-l-2 border-stone-100 pl-3">
      {shown.map((t) => {
        const first = t.item;
        const subs = group(t.lines, (l) => l.subtask?.id, (l) => l.subtask);
        const people = [...new Set(t.lines.map((l) => l.member?.id))].map((id) => memberById.get(id)).filter(Boolean);
        return (
          <li key={t.key}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => first.task && openItem(first.task.id)} className="min-w-0 flex-1 truncate text-left text-sm font-bold text-stone-800 hover:text-brand-700">
                {first.task?.name ?? "Deleted task"}
                <span className="ml-1.5 text-xs font-normal text-stone-400">{first.project?.name}</span>
              </button>
              {showMembers && <AvatarStack members={people} size="xs" max={3} />}
              <BillingTag billing={billingOfGroup(t)} />
              <span className="w-16 shrink-0 text-right text-sm font-bold text-stone-900 tabular-nums">{formatHours(t.secs)}</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {subs.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs text-stone-500">
                  <button type="button" onClick={() => s.item && openItem(s.item.id)} className="min-w-0 flex-1 truncate text-left hover:text-brand-700">
                    {s.item?.name ?? "Deleted subtask"} Â· {plural(s.count, "clocking")}
                  </button>
                  <span className="w-16 shrink-0 text-right tabular-nums">{formatHours(s.secs)}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
      {tasks.length > TASKS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-bold text-brand-600 hover:underline">
          {all ? "Show fewer tasks" : `Show all ${tasks.length} tasks`}
        </button>
      )}
    </ul>
  );
}

function ByMember({ lines }) {
  const people = group(lines, (l) => l.member?.id, (l) => l.member);
  const max = Math.max(...people.map((p) => p.secs), 1);
  const [open, setOpen] = useState(() => new Set(people.length === 1 ? [people[0].key] : []));
  const toggle = (k) => setOpen((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));

  return (
    <ul className="divide-y divide-stone-100">
      {people.map((p) => (
        <Expandable
          key={p.key}
          open={open.has(p.key)}
          onToggle={() => toggle(p.key)}
          header={
            <>
              {p.item ? <Avatar member={p.item} size="sm" /> : <Users className="size-5 text-stone-400" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-stone-800">{p.item?.name ?? "Unknown"}</span>
                  <span className="shrink-0 text-xs text-stone-400">{plural(group(p.lines, (l) => l.task?.id, () => null).length, "task")}</span>
                </span>
                <span className="mt-1.5 block">
                  <SplitBar billable={p.billable} non={p.non} max={max} title={`${formatHours(p.billable)} billable, ${formatHours(p.non)} non-billable`} />
                </span>
              </span>
              <Figures g={p} />
            </>
          }
        >
          <TaskList lines={p.lines} />
        </Expandable>
      ))}
    </ul>
  );
}

function ByProject({ lines, showClient }) {
  const projects = group(lines, (l) => l.project?.id, (l) => l);
  const max = Math.max(...projects.map((p) => p.secs), 1);
  const [open, setOpen] = useState(() => new Set(projects.length === 1 ? [projects[0].key] : []));
  const toggle = (k) => setOpen((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));

  return (
    <ul className="divide-y divide-stone-100">
      {projects.map((p) => (
        <Expandable
          key={p.key}
          open={open.has(p.key)}
          onToggle={() => toggle(p.key)}
          header={
            <>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-500">
                <Folder className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-stone-800">
                  {p.item.project?.name ?? "No project"}
                  {showClient && <span className="ml-1.5 text-xs font-normal text-stone-400">{p.item.client?.name}</span>}
                </span>
                <span className="mt-1.5 block">
                  <SplitBar billable={p.billable} non={p.non} max={max} title={`${formatHours(p.billable)} billable, ${formatHours(p.non)} non-billable`} />
                </span>
              </span>
              <Figures g={p} />
            </>
          }
        >
          <TaskList lines={p.lines} showMembers />
        </Expandable>
      ))}
    </ul>
  );
}
