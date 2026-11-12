import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, ImageOff, ListChecks, Search, Users, X } from "lucide-react";
import { navigate } from "../../lib/router";
import { addDays, decimalHours, dueInfo, formatDate, formatHours, formatTime, fromDateKey, startOfWeek, toDateKey, todayKey } from "../../lib/time";
import { listSnapshots, snapshotUrls } from "../../store/db";
import { assigneesOf, clientCycle, isDone, progressOf, subtaskIdsUnder } from "../../store/model";
import { Pager, Segmented } from "../admin/AdminPage";
import { StatTile } from "../work/DashboardParts";
import { Avatar, AvatarStack, Button, Card, EmptyState, Field, STATUS_STYLE, Select, StatusIcon, cx, inputClass } from "../ui";
import { Collapse } from "../motion";

/*
 * The client portal's Work, Hours and Screenshots pages. Read only.
 */

/** Seconds of `entries` inside [from, to), clipping entries that cross the edges. */
export function secondsIn(entries, from, to, now = Date.now()) {
  let total = 0;
  for (const e of entries) {
    const start = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to);
    if (end > start) total += (end - start) / 1000;
  }
  return total;
}

const DUE_TONE = { danger: "text-red-600 font-bold", warning: "text-amber-600 font-semibold", default: "text-stone-500", muted: "text-stone-400" };

/** Project › Task names for a subtask. */
function placeOf(index, subtask) {
  const task = subtask && index.get(subtask.parentId);
  const project = task && index.get(task.parentId);
  return { task, project };
}

/* ---------- Work: projects → tasks → subtasks ---------- */

export function WorkPage({ client, index, entries, team, projectId }) {
  const [show, setShow] = useState("open");
  const [query, setQuery] = useState("");
  const allProjects = index.childrenOf(client.id).filter((p) => p.type === "project");
  const project = projectId && index.get(projectId)?.type === "project" ? projectId : "";
  const projects = project ? allProjects.filter((p) => p.id === project) : allProjects;
  const q = query.trim().toLowerCase();
  const secsBySubtask = useMemo(() => {
    const map = new Map();
    for (const e of entries) map.set(e.subtaskId, (map.get(e.subtaskId) ?? 0) + secondsIn([e], 0, Date.now() + 1));
    return map;
  }, [entries]);

  const taskMatches = (t) => {
    if (show === "open" && isDone(t)) return false;
    if (show === "done" && !isDone(t)) return false;
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || index.childrenOf(t.id).some((s) => s.name.toLowerCase().includes(q));
  };

  return (
    <>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <h1 className="text-xl font-extrabold tracking-tight text-stone-900">Work</h1>
        <Segmented label="Show" value={show} onChange={setShow} options={[["open", "Open"], ["done", "Completed"], ["all", "All"]]} size="sm" />
        <span className="flex-1" />
        {allProjects.length > 1 && (
          <div className="w-full sm:w-52">
            <Select
              aria-label="Project"
              value={project}
              onChange={(e) => (e.target.value ? navigate("work", e.target.value) : navigate("work"))}
              options={[{ value: "", label: "All projects" }, ...allProjects.map((p) => ({ value: p.id, label: p.name }))]}
              className="!h-10"
            />
          </div>
        )}
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="h-10 w-full rounded-2xl bg-stone-100 pr-3 pl-10 text-sm outline-none placeholder:text-stone-400 focus:bg-surface focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </Card>

      {!projects.length && <EmptyState icon={ListChecks} title="No projects yet" />}
      {projects.map((p) => {
        const tasks = index.childrenOf(p.id).filter((t) => t.type === "task" && taskMatches(t));
        const prog = progressOf(index, p.id);
        const ids = subtaskIdsUnder(index, p.id);
        const secs = [...ids].reduce((s, id) => s + (secsBySubtask.get(id) ?? 0), 0);
        return (
          <Card key={p.id} className="p-4 @md:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-extrabold tracking-tight text-stone-900">{p.name}</h2>
              <span className="text-xs font-semibold text-stone-500 tabular-nums">
                {formatHours(secs)} logged · {prog.done}/{prog.total} done
              </span>
            </div>
            {!tasks.length ? (
              <p className="py-4 text-center text-sm text-stone-400">{show === "done" ? "Nothing completed yet" : show === "open" ? "Nothing open" : "No tasks yet"}</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} index={index} team={team} secsBySubtask={secsBySubtask} query={q} />
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </>
  );
}

function TaskRow({ task, index, team, secsBySubtask, query }) {
  const [open, setOpen] = useState(false);
  const subtasks = index.childrenOf(task.id).filter((s) => s.type === "subtask");
  const shown = query && !task.name.toLowerCase().includes(query) ? subtasks.filter((s) => s.name.toLowerCase().includes(query)) : subtasks;
  const expanded = open || (!!query && shown.length > 0);
  const prog = progressOf(index, task.id);
  const due = dueInfo(task.due, isDone(task));
  const secs = subtasks.reduce((s, x) => s + (secsBySubtask.get(x.id) ?? 0), 0);

  return (
    <li className={cx("rounded-2xl transition", expanded ? "bg-brand-50/50 ring-1 ring-brand-100" : "bg-stone-50")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={expanded} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl p-3 text-left hover:bg-brand-50/70">
        <StatusIcon status={task.status} className="size-[18px] shrink-0" />
        <span className={cx("min-w-0 flex-1 truncate text-sm font-bold text-stone-800", isDone(task) && "text-stone-400 line-through")}>{task.name}</span>
        <span className="flex items-center gap-2.5 text-xs">
          {task.due && <span className={cx("whitespace-nowrap", DUE_TONE[due.tone])}>{due.label}</span>}
          {prog.total > 0 && <span className="text-stone-400 tabular-nums">{prog.done}/{prog.total}</span>}
          {secs > 0 && <span className="font-semibold text-stone-600 tabular-nums">{formatHours(secs)}</span>}
          <ChevronDown className={cx("size-4 text-stone-400 transition-transform", expanded && "rotate-180")} />
        </span>
      </button>
      <Collapse open={expanded}>
        <ul className="space-y-1 px-3 pb-3 pl-10">
          {!shown.length && <li className="py-1 text-xs text-stone-400">No subtasks</li>}
          {shown.map((s) => {
            const people = assigneesOf(s).map((id) => team.get(id)).filter(Boolean);
            const sDue = dueInfo(s.due, isDone(s));
            const sSecs = secsBySubtask.get(s.id) ?? 0;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-3 py-2 ring-1 ring-stone-900/5">
                <span className={cx("min-w-0 flex-1 truncate text-sm font-semibold text-stone-800", isDone(s) && "text-stone-400 line-through")}>{s.name}</span>
                <span className="flex items-center gap-2.5 text-xs">
                  {s.due && <span className={cx("whitespace-nowrap", DUE_TONE[sDue.tone])}>{sDue.label}</span>}
                  {sSecs > 0 && <span className="font-semibold text-stone-600 tabular-nums">{formatHours(sSecs)}</span>}
                  {people.length > 0 && (
                    <span title={people.map((m) => m.name).join(", ")}>
                      <AvatarStack members={people} max={3} size="xs" />
                    </span>
                  )}
                  <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", STATUS_STYLE[s.status]?.pill ?? "bg-stone-100 text-stone-600")}>{s.status ?? "To do"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Collapse>
    </li>
  );
}

/* ---------- Hours: every time entry on the client's work ---------- */

function monthRange(offset) {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const to = offset === 0 ? d : new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return [toDateKey(from), toDateKey(to)];
}

export function HoursPage({ client, index, entries, team }) {
  const cycle = clientCycle(client, todayKey());
  const ranges = [
    ["month", "This month"],
    ["last", "Last month"],
    ...(cycle && !cycle.upcoming ? [["cycle", "This cycle"]] : []),
    ["custom", "Custom"],
  ];
  const [range, setRange] = useState("month");
  const [[from, to], setDates] = useState(() => monthRange(0));
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const projects = index.childrenOf(client.id).filter((p) => p.type === "project");

  const pick = (key) => {
    setRange(key);
    if (key === "month") setDates(monthRange(0));
    if (key === "last") setDates(monthRange(-1));
    if (key === "cycle") setDates([cycle.start, cycle.end < todayKey() ? cycle.end : todayKey()]);
  };

  const now = Date.now();
  const [fromMs, toMs] = [fromDateKey(from), addDays(fromDateKey(to), 1)];
  const inProject = projectId ? subtaskIdsUnder(index, projectId) : null;
  const rows = entries
    .filter((e) => e.start >= fromMs && e.start < toMs && (!inProject || inProject.has(e.subtaskId)))
    .sort((a, b) => b.start - a.start);
  const total = secondsIn(rows, 0, now + 1, now);
  const people = new Set(rows.map((e) => e.memberId));

  // Grouped by day, newest first.
  const days = [];
  for (const e of rows) {
    const key = toDateKey(e.start);
    if (days.at(-1)?.key !== key) days.push({ key, rows: [] });
    days.at(-1).rows.push(e);
  }

  const line = (e) => {
    const sub = index.get(e.subtaskId);
    const { task, project } = placeOf(index, sub);
    return { e, sub, task, project, person: team.get(e.memberId), secs: secondsIn([e], 0, now + 1, now) };
  };

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const [{ jsPDF }, tables] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      (tables.applyPlugin ?? tables.default.applyPlugin)(jsPDF);
      const lines = [...rows].reverse().map(line);
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFont("helvetica", "bold").setFontSize(18).text("Hours report", 40, 50);
      doc.setFontSize(10).setTextColor(90);
      let y = 74;
      const projectName = projects.find((p) => p.id === projectId)?.name ?? "All projects";
      for (const [label, value] of [
        ["Client", client.name],
        ["Project", projectName],
        ["Dates", from === to ? from : `${from} to ${to}`],
        ["Total", `${formatHours(total)} (${decimalHours(total)} h)`],
      ]) {
        doc.setFont("helvetica", "bold").text(`${label}:`, 40, y);
        doc.setFont("helvetica", "normal").text(value, 100, y);
        y += 15;
      }
      doc.setTextColor(0);
      doc.autoTable({
        startY: y + 6,
        head: [["Date", "Team member", "Project", "Task", "Subtask", "Start", "End", "Hours"]],
        body: lines.map((l) => [
          formatDate(l.e.start, { day: "numeric", month: "short", year: "numeric" }),
          l.person?.name ?? "Team member",
          l.project?.name ?? "",
          l.task?.name ?? "",
          l.sub?.name ?? "",
          formatTime(l.e.start),
          l.e.end ? formatTime(l.e.end) : "running",
          formatHours(l.secs),
        ]),
        foot: [["Total", "", "", "", "", "", "", formatHours(total)]],
        footStyles: { fillColor: [245, 245, 244], textColor: 20 },
        showFoot: "lastPage",
        headStyles: { fillColor: [235, 104, 52] },
        styles: { fontSize: 9, cellPadding: 4 },
        margin: { left: 40, right: 40 },
      });
      const slug = (s) => s.replace(/[^\w-]+/g, "-").toLowerCase();
      doc.save(`hours-${slug(client.name)}-${from}-to-${to}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="p-4 @md:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold tracking-tight text-stone-900">Hours</h1>
          <Segmented label="Dates" value={range} onChange={pick} options={ranges} size="sm" />
          <span className="flex-1" />
          <Button variant="soft" size="sm" icon={Download} disabled={!rows.length || busy} onClick={downloadPdf}>
            {busy ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
        <div className="grid gap-3 @lg:grid-cols-3">
          {projects.length > 1 && (
            <Field label="Project">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
            </Field>
          )}
          <Field label="From">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && (setDates([e.target.value, to]), setRange("custom"))} className={inputClass} />
          </Field>
          <Field label="To">
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && (setDates([from, e.target.value]), setRange("custom"))} className={inputClass} />
          </Field>
        </div>
      </Card>

      <div className="grid gap-3 @lg:grid-cols-3">
        <StatTile icon={Clock} tone="brand" label="Hours" value={formatHours(total)} />
        <StatTile icon={ListChecks} tone="violet" label="Sessions" value={String(rows.length)} />
        <StatTile icon={Users} tone="sky" label="People" value={String(people.size)} />
      </div>

      <Card className="p-4 @md:p-5">
        {!days.length ? (
          <EmptyState icon={Clock} title="No hours in these dates" />
        ) : (
          <div className="space-y-5">
            {days.map((d) => (
              <section key={d.key}>
                <h2 className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-extrabold tracking-widest text-stone-400 uppercase">
                  {formatDate(fromDateKey(d.key), { weekday: "long", day: "numeric", month: "short" })}
                  <span className="text-stone-600 tabular-nums">{formatHours(secondsIn(d.rows, 0, now + 1, now))}</span>
                </h2>
                <ul className="space-y-1.5">
                  {d.rows.map((e) => {
                    const l = line(e);
                    return (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-stone-50 p-3 @lg:flex-nowrap">
                        <Avatar member={l.person} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-stone-800">{l.sub?.name ?? "Subtask"}</span>
                          <span className="block truncate text-xs text-stone-400">
                            {l.person?.name ?? "Team member"} · {[l.project?.name, l.task?.name].filter(Boolean).join(" › ")}
                          </span>
                        </span>
                        <span className="ml-10 text-xs whitespace-nowrap text-stone-500 tabular-nums @lg:ml-0">
                          {formatTime(e.start)}–{e.end ? formatTime(e.end) : "now"}
                        </span>
                        <span className="w-16 text-right text-sm font-extrabold whitespace-nowrap text-stone-900 tabular-nums">
                          {e.end == null && <span className="mr-1.5 inline-block size-2 animate-pulse-dot rounded-full bg-emerald-500" />}
                          {formatHours(l.secs)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------- Screenshots ---------- */

const PER_PAGE = 48;

function shotRange(key) {
  const today = todayKey();
  if (key === "today") return [today, today];
  if (key === "yesterday") {
    const y = toDateKey(addDays(fromDateKey(today), -1));
    return [y, y];
  }
  if (key === "week") return [toDateKey(startOfWeek(Date.now())), today];
  if (key === "month") return monthRange(0);
  return null;
}

export function ScreenshotsPage({ index, entries, team }) {
  const [range, setRange] = useState("week");
  const [[from, to], setDates] = useState(() => shotRange("week"));
  const [shots, setShots] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [urls, setUrls] = useState(new Map());
  const [open, setOpen] = useState(null); // index in the page's list
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  useEffect(() => {
    let alive = true;
    setShots(null);
    setError("");
    listSnapshots({ from: fromDateKey(from), to: addDays(fromDateKey(to), 1) })
      .then((list) => alive && setShots(list))
      .catch((err) => alive && (setError(err.message ?? String(err)), setShots([])));
    return () => {
      alive = false;
    };
  }, [from, to]);

  const visible = useMemo(() => (shots ?? []).slice(page * PER_PAGE, (page + 1) * PER_PAGE), [shots, page]);

  // Links for this page's images (the bucket is private; links last an hour).
  useEffect(() => {
    const missing = visible.map((s) => s.path).filter((p) => !urls.has(p));
    if (!missing.length) return;
    let alive = true;
    snapshotUrls(missing)
      .then((m) => alive && setUrls((prev) => new Map([...prev, ...m])))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (key) => {
    setRange(key);
    const r = shotRange(key);
    if (r) setDates(r);
    setPage(0);
  };
  const describe = (s) => {
    const e = entryById.get(s.entryId);
    const sub = e && index.get(e.subtaskId);
    const { task, project } = placeOf(index, sub);
    return { person: team.get(s.memberId), sub, where: [project?.name, task?.name].filter(Boolean).join(" › ") };
  };

  const days = [];
  visible.forEach((s, i) => {
    const key = toDateKey(s.takenAt);
    if (days.at(-1)?.key !== key) days.push({ key, shots: [] });
    days.at(-1).shots.push({ s, i });
  });

  return (
    <>
      <Card className="p-4 @md:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold tracking-tight text-stone-900">Screenshots</h1>
          <Segmented
            label="Dates"
            value={range}
            onChange={pick}
            options={[["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"]]}
            size="sm"
          />
        </div>
        <div className="grid gap-3 @lg:grid-cols-2">
          <Field label="From">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && (setDates([e.target.value, to]), setRange("custom"), setPage(0))} className={inputClass} />
          </Field>
          <Field label="To">
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && (setDates([from, e.target.value]), setRange("custom"), setPage(0))} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 @md:p-5">
        {shots === null ? (
          <p className="animate-skeleton py-10 text-center text-sm font-semibold text-stone-400">Loading screenshots…</p>
        ) : error ? (
          <EmptyState icon={ImageOff} title="Couldn't load screenshots" text={error} />
        ) : !shots.length ? (
          <EmptyState icon={Camera} title="No screenshots in these dates" />
        ) : (
          <>
            <div className="space-y-5">
              {days.map((d) => (
                <section key={d.key}>
                  <h2 className="mb-2 px-1 text-xs font-extrabold tracking-widest text-stone-400 uppercase">
                    {formatDate(fromDateKey(d.key), { weekday: "long", day: "numeric", month: "short" })}
                  </h2>
                  <ul className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-4">
                    {d.shots.map(({ s, i }) => {
                      const info = describe(s);
                      const url = urls.get(s.path);
                      return (
                        <li key={s.id}>
                          <button type="button" onClick={() => setOpen(i)} className="group block w-full overflow-hidden rounded-2xl bg-stone-50 text-left ring-1 ring-stone-900/5 hover:ring-brand-300">
                            <span className="block aspect-video bg-stone-200">
                              {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" /> : <span className="block size-full animate-skeleton" />}
                            </span>
                            <span className="flex items-center gap-2 p-2">
                              <Avatar member={info.person} size="xs" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-bold text-stone-800">{info.sub?.name ?? "Subtask"}</span>
                                <span className="block truncate text-[11px] text-stone-400">{formatTime(s.takenAt)} · {info.person?.name ?? "Team member"}</span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            <Pager page={page} total={shots.length} perPage={PER_PAGE} onPage={setPage} />
          </>
        )}
      </Card>

      {open != null && visible[open] && (
        <Viewer
          shot={visible[open]}
          url={urls.get(visible[open].path)}
          info={describe(visible[open])}
          onPrev={open > 0 ? () => setOpen(open - 1) : null}
          onNext={open < visible.length - 1 ? () => setOpen(open + 1) : null}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** One screenshot, large. Arrow keys move between them, Escape closes. */
function Viewer({ shot, url, info, onPrev, onNext, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext, onClose]);

  const nav = "grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30";
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Screenshot" className="fixed inset-0 z-50 flex flex-col bg-stone-950/90 p-4 backdrop-blur" onClick={onClose}>
      <div className="flex items-center gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <Avatar member={info.person} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{info.sub?.name ?? "Subtask"}</p>
          <p className="truncate text-xs text-white/60">
            {info.person?.name ?? "Team member"} · {formatDate(shot.takenAt)} {formatTime(shot.takenAt)}
            {info.where && ` · ${info.where}`}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className={nav}>
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-3 pt-4">
        <button type="button" aria-label="Previous" disabled={!onPrev} onClick={(e) => (e.stopPropagation(), onPrev?.())} className={nav}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          {url ? (
            <img src={url} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-xl object-contain shadow-float" />
          ) : (
            <Camera className="size-8 animate-pulse text-white/50" />
          )}
        </div>
        <button type="button" aria-label="Next" disabled={!onNext} onClick={(e) => (e.stopPropagation(), onNext?.())} className={nav}>
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
