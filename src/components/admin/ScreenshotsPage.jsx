import { useEffect, useMemo, useState } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ImageOff, Search, Trash, X } from "lucide-react";
import { addDays, formatDate, formatTime, fromDateKey, startOfWeek, toDateKey } from "../../lib/time";
import { navigate, openItem, useRoute } from "../../lib/router";
import { ancestry, assigneesOf, pathLabel, workingMembers } from "../../store/model";
import { deleteSnapshot, listSnapshots, snapshotUrls } from "../../store/db";
import { useDialogs } from "../dialogs";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { Avatar, Card, EmptyState, Field, Popover, Select, cx, inputClass } from "../ui";
import { AdminPage, Pager, Segmented } from "./AdminPage";

/*
 * Screenshots (admin only): filter by client, team member and date range, or open it for one task
 * or subtask (#/screenshots?task=<id> or ?subtask=<id>) from that item's page.
 * Images live in the private "snapshots" bucket; the page shows them through
 * short-lived signed links. Screenshots are grouped by clocking session under day headings;
 * a collapsed session shows a few thumbnails spread across it.
 */

const SESSIONS_PER_PAGE = 10;
const DENSITY_KEY = "handysolver-screenshot-density";
// Thumbnails shown on a collapsed session (spread evenly across it), per density.
const PREVIEW = { compact: 8, large: 4 };
const GRID = {
  compact: "grid-cols-4 @lg:grid-cols-6 @3xl:grid-cols-8",
  large: "grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4",
};

/** `count` items spread evenly across `list` (first and last included). */
function spread(list, count) {
  if (list.length <= count) return list;
  return Array.from({ length: count }, (_, i) => list[Math.round((i * (list.length - 1)) / (count - 1))]);
}

/** Quick date ranges: [from, to] as "YYYY-MM-DD". */
function rangeFor(key, now = Date.now()) {
  const today = toDateKey(now);
  if (key === "today") return [today, today];
  if (key === "yesterday") {
    const y = toDateKey(addDays(fromDateKey(today), -1));
    return [y, y];
  }
  if (key === "week") return [toDateKey(startOfWeek(now)), today];
  return null;
}

function durationLabel(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${String(mins % 60).padStart(2, "0")}m` : `${mins}m`;
}

export default function ScreenshotsPage() {
  const { state, teamEntries, allIndex: index, memberById, me } = useStore();
  // The admin sees (and can delete) everyone's; a team member sees only their own (the database enforces this too).
  const admin = isAdmin(me);
  const clients = state.items.filter((i) => i.type === "client").sort((a, b) => a.name.localeCompare(b.name));
  const team = workingMembers(state.members, state.items, teamEntries);

  // Opened from a task or subtask page ("View screenshots"): only that work, from when it was created.
  const { params } = useRoute();
  const scopeId = params.subtask || params.task || "";
  const scope = scopeId ? index.get(scopeId) : null;
  const scopeClient = scope ? ancestry(index, scope.id).find((x) => x.type === "client") : null;

  const [clientId, setClientId] = useState(() => scopeClient?.id ?? "");
  const [memberId, setMemberId] = useState("");
  const [subtaskId, setSubtaskId] = useState("");
  // Today by default; from a task or subtask page, everything since it was created.
  const [range, setRange] = useState(scope ? "custom" : "today");
  const [from, setFrom] = useState(() => (scope ? toDateKey(scope.createdAt ?? startOfWeek(Date.now())) : toDateKey(Date.now())));
  const [to, setTo] = useState(() => toDateKey(Date.now()));
  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem(DENSITY_KEY) === "large" ? "large" : "compact";
    } catch {
      return "compact";
    }
  });
  const [page, setPage] = useState(0);
  const [shots, setShots] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [urls, setUrls] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set()); // session keys showing every screenshot
  const [open, setOpen] = useState(null); // { key, i }: a session's screenshot shown large
  const { confirm, toast } = useDialogs();

  const pickRange = (key) => {
    setRange(key);
    const r = rangeFor(key);
    if (r) {
      setFrom(r[0]);
      setTo(r[1]);
    }
    setPage(0);
  };
  const pickDensity = (d) => {
    setDensity(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* remembered for this visit only */
    }
  };

  // Delete a screenshot (image + record) after confirming.
  const askDelete = (s) =>
    confirm({
      title: "Delete this screenshot?",
      message: `The screenshot from ${memberById.get(s.memberId)?.name ?? "this team member"} taken ${formatDate(s.takenAt)} at ${formatTime(s.takenAt)} will be permanently deleted. This can't be undone.`,
      confirmLabel: "Delete screenshot",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteSnapshot(s);
          setShots((list) => list.filter((x) => x.id !== s.id));
          setOpen(null);
          toast("Screenshot deleted");
        } catch (err) {
          toast(`Couldn't delete: ${err.message ?? err}`, "error");
        }
      },
    });

  // Load the records for the member + date range from Supabase.
  useEffect(() => {
    let alive = true;
    setShots(null);
    setError("");
    listSnapshots({ memberId: memberId || undefined, from: fromDateKey(from), to: addDays(fromDateKey(to), 1) })
      .then((list) => alive && setShots(list))
      .catch((err) => alive && (setError(err.message ?? String(err)), setShots([])));
    return () => {
      alive = false;
    };
  }, [memberId, from, to]);

  // Subtask, project and client come from the clocking the screenshot was taken during.
  const entryById = useMemo(() => new Map(teamEntries.map((e) => [e.id, e])), [teamEntries]);
  const filtered = useMemo(
    () =>
      (shots ?? [])
        .map((s) => {
          const entry = entryById.get(s.entryId);
          const chain = entry ? ancestry(index, entry.subtaskId) : [];
          return {
            ...s,
            entry,
            chain,
            subtask: chain.find((x) => x.type === "subtask"),
            project: chain.find((x) => x.type === "project"),
            client: chain.find((x) => x.type === "client"),
          };
        })
        // Team members: only screenshots from subtasks they're assigned to.
        .filter((s) => admin || (s.subtask && assigneesOf(s.subtask).includes(me.id)))
        .filter((s) => !clientId || s.client?.id === clientId)
        .filter((s) => !subtaskId || s.subtask?.id === subtaskId)
        .filter((s) => !scopeId || s.chain.some((x) => x.id === scopeId)),
    [shots, entryById, index, clientId, subtaskId, scopeId, admin, me.id],
  );

  // One session per clocking (clock in → clock out), newest first; its screenshots oldest first.
  const sessions = useMemo(() => {
    const byKey = new Map();
    for (const s of filtered) {
      const key = s.entryId ?? `${s.memberId}-${toDateKey(s.takenAt)}`;
      if (!byKey.has(key)) byKey.set(key, { key, entry: s.entry, memberId: s.memberId, subtask: s.subtask, project: s.project, client: s.client, shots: [] });
      byKey.get(key).shots.push(s);
    }
    return [...byKey.values()]
      .map((x) => {
        const shotsAsc = x.shots.sort((a, b) => a.takenAt - b.takenAt);
        const start = x.entry?.start ?? shotsAsc[0].takenAt;
        const end = x.entry ? x.entry.end : shotsAsc.at(-1).takenAt;
        return { ...x, shots: shotsAsc, start, end, day: toDateKey(start) };
      })
      .sort((a, b) => b.start - a.start);
  }, [filtered]);

  // Subtask choices: in the chosen client (and task scope); for team members, only ones assigned to them.
  const subtaskOptions = useMemo(
    () =>
      state.items
        .filter((s) => s.type === "subtask" && (admin || assigneesOf(s).includes(me.id)))
        .filter((s) => {
          const chain = ancestry(index, s.id);
          return (!clientId || chain.some((x) => x.id === clientId)) && (!scopeId || chain.some((x) => x.id === scopeId));
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.items, admin, me.id, index, clientId, scopeId],
  );

  const visibleSessions = sessions.slice(page * SESSIONS_PER_PAGE, (page + 1) * SESSIONS_PER_PAGE);
  const shownShots = (x) => (expanded.has(x.key) ? x.shots : spread(x.shots, PREVIEW[density]));
  // Visible sessions grouped under day headings.
  const days = [];
  for (const x of visibleSessions) {
    if (days.at(-1)?.day !== x.day) days.push({ day: x.day, sessions: [] });
    days.at(-1).sessions.push(x);
  }

  // Signed links for the thumbnails on screen.
  const visibleKey = visibleSessions.flatMap((x) => shownShots(x).map((s) => s.path)).join("|");
  useEffect(() => {
    const missing = visibleKey ? visibleKey.split("|").filter((p) => !urls.has(p)) : [];
    if (!missing.length) return;
    let alive = true;
    snapshotUrls(missing)
      .then((m) => alive && setUrls((old) => new Map([...old, ...m])))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const toggle = (key) =>
    setExpanded((old) => {
      const next = new Set(old);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const resetPage = (fn) => (e) => {
    fn(e.target.value);
    setPage(0);
  };
  const viewing = open ? sessions.find((x) => x.key === open.key) : null;
  const viewingShot = viewing?.shots[open.i];

  return (
    <AdminPage title={admin ? "Screenshots" : "My screenshots"} everyone>
      <Card className="p-4 @md:p-5">
        {scope && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-sm">
            <span className="font-semibold text-stone-600">{scope.type === "task" ? "Task" : "Subtask"}:</span>
            <button type="button" onClick={() => openItem(scope.id)} className="min-w-0 truncate font-bold text-brand-700 hover:underline">
              {pathLabel(index, scope.id, { includeSelf: true }).replaceAll(" / ", " › ")}
            </button>
            <button
              type="button"
              onClick={() => navigate("screenshots")}
              className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-stone-500 hover:bg-white hover:text-stone-800"
            >
              <X className="size-3.5" /> Clear
            </button>
          </div>
        )}
        {/* Quick ranges */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Segmented
            label="Date range"
            value={range}
            onChange={pickRange}
            options={[
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["week", "This week"],
              ["custom", "Custom"],
            ]}
          />
        </div>
        <div className={cx("grid gap-3 @lg:grid-cols-2", admin ? "@4xl:grid-cols-5" : "@3xl:grid-cols-4")}>
          <Field label="Client">
            <Select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setSubtaskId(""); // the subtask may not belong to the new client
                setPage(0);
              }}
              options={[{ value: "", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
          {/* Not a <label>: the picker is a button + list */}
          <div className="min-w-0">
            <span className="mb-1.5 block text-xs font-bold text-stone-600">Subtask</span>
            <SubtaskPicker
              value={subtaskId}
              options={subtaskOptions}
              index={index}
              onChange={(id) => {
                setSubtaskId(id);
                setPage(0);
              }}
            />
          </div>
          {admin && (
            <Field label="Team member">
              <Select value={memberId} onChange={resetPage(setMemberId)} options={[{ value: "", label: "Everyone" }, ...team.map((m) => ({ value: m.id, label: m.name }))]} />
            </Field>
          )}
          <Field label="From">
            <input type="date" value={from} max={to} onChange={resetPage((v) => (setFrom(v), setRange("custom")))} className={inputClass} />
          </Field>
          <Field label="To">
            <input type="date" value={to} min={from} onChange={resetPage((v) => (setTo(v), setRange("custom")))} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 @md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-stone-700">
            {shots == null
              ? "Loading…"
              : `${filtered.length} screenshot${filtered.length === 1 ? "" : "s"} · ${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex items-center gap-2">
            <Segmented label="Thumbnail size" value={density} onChange={pickDensity} options={[["compact", "Compact"], ["large", "Large"]]} />
            <Pager page={page} total={sessions.length} perPage={SESSIONS_PER_PAGE} onPage={setPage} />
          </div>
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {shots != null && !sessions.length ? (
          <EmptyState icon={Camera} title="No screenshots for these filters" />
        ) : (
          <div className="space-y-6">
            {days.map(({ day, sessions: list }) => (
              <section key={day}>
                <h3 className="mb-2 text-xs font-extrabold tracking-widest text-stone-400 uppercase">
                  {formatDate(day, { weekday: "short", day: "numeric", month: "short" })}
                </h3>
                <ul className="space-y-3">
                  {list.map((x) => {
                    const member = memberById.get(x.memberId);
                    const isOpen = expanded.has(x.key);
                    const shown = shownShots(x);
                    const hidden = x.shots.length - shown.length;
                    return (
                      <li key={x.key} className="rounded-2xl bg-stone-50/80 p-3 ring-1 ring-stone-900/5">
                        {/* Session: who, what (subtask + project), when, how long, how many */}
                        <button type="button" onClick={() => toggle(x.key)} aria-expanded={isOpen} className="group mb-2.5 flex w-full items-center gap-3 text-left">
                          <Avatar member={member} size="sm" />
                          <span className="min-w-0 flex-1" title={x.client ? `${x.client.name} › ${x.project?.name ?? ""} › ${x.subtask?.name ?? ""}` : undefined}>
                            <span className="block truncate text-sm font-bold text-stone-800">
                              {admin && <span className="text-stone-500">{member?.name ?? "Someone"} · </span>}
                              {x.subtask?.name ?? "Deleted subtask"}
                              {x.project && <span className="font-medium text-stone-500"> ({x.project.name})</span>}
                            </span>
                            <span className="block truncate text-xs text-stone-500">
                              {formatTime(x.start)}–{x.end ? formatTime(x.end) : "now"} · {durationLabel((x.end ?? Date.now()) - x.start)}
                              {x.end == null && <span className="ml-1.5 inline-block size-1.5 animate-pulse-dot rounded-full bg-emerald-500 align-middle" />}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-stone-600 ring-1 ring-stone-200">
                            {x.shots.length} <Camera className="mb-0.5 inline size-3.5 text-stone-400" />
                          </span>
                          <ChevronDown className={cx("size-4 shrink-0 text-stone-400 transition-transform group-hover:text-stone-700", isOpen && "rotate-180")} />
                        </button>
                        <ul className={cx("grid gap-2", GRID[density])}>
                          {shown.map((s, i) => {
                            const last = !isOpen && hidden > 0 && i === shown.length - 1;
                            return (
                              <li key={s.id} className="group/shot relative">
                                {/* Delete (admin): shows on hover (and keyboard focus) */}
                                {admin && !last && (
                                  <button
                                    type="button"
                                    onClick={() => askDelete(s)}
                                    aria-label={`Delete screenshot from ${formatDate(s.takenAt)} ${formatTime(s.takenAt)}`}
                                    title="Delete screenshot"
                                    className="absolute top-1.5 right-1.5 z-10 grid size-7 place-items-center rounded-lg bg-white/95 text-red-600 opacity-0 shadow-soft ring-1 ring-stone-900/10 transition group-hover/shot:opacity-100 hover:bg-red-600 hover:text-white focus-visible:opacity-100"
                                  >
                                    <Trash className="size-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => (last ? toggle(x.key) : setOpen({ key: x.key, i: x.shots.indexOf(s) }))}
                                  className="group relative block w-full overflow-hidden rounded-xl bg-stone-100 text-left ring-1 ring-stone-900/5 transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-brand-200"
                                >
                                  <Thumb url={urls.get(s.path)} />
                                  {last ? (
                                    // The last preview tile opens the rest of the session.
                                    <span className="absolute inset-0 grid place-items-center bg-stone-900/60 text-white">
                                      <span className="text-center leading-tight">
                                        <span className="block text-lg font-extrabold">+{hidden + 1}</span>
                                        <span className="text-[11px] font-semibold">Show all</span>
                                      </span>
                                    </span>
                                  ) : (
                                    <span
                                      className={cx(
                                        "palette-fixed absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 font-semibold text-white tabular-nums",
                                        density === "compact" ? "text-[10px]" : "text-xs",
                                      )}
                                    >
                                      {formatTime(s.takenAt)}
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        {isOpen && x.shots.length > PREVIEW[density] && (
                          <button type="button" onClick={() => toggle(x.key)} className="mt-2 text-xs font-bold text-brand-700 hover:underline">
                            Show fewer
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      {viewingShot && (
        <Viewer
          shot={viewingShot}
          url={urls.get(viewingShot.path)}
          member={memberById.get(viewingShot.memberId)}
          onClose={() => setOpen(null)}
          onPrev={open.i > 0 ? () => setOpen({ ...open, i: open.i - 1 }) : null}
          onNext={open.i < viewing.shots.length - 1 ? () => setOpen({ ...open, i: open.i + 1 }) : null}
          needUrl={(path) => !urls.has(path) && snapshotUrls([path]).then((m) => setUrls((old) => new Map([...old, ...m])))}
          onDelete={
            admin
              ? () => {
                  setOpen(null); // close the viewer so the confirmation shows on top
                  askDelete(viewingShot);
                }
              : null
          }
        />
      )}
    </AdminPage>
  );
}

/** A subtask dropdown with a search box. `options` are subtask items. */
function SubtaskPicker({ value, options, index, onChange }) {
  const [query, setQuery] = useState("");
  const selected = value ? index.get(value) : null;
  const q = query.trim().toLowerCase();
  const shown = options
    .map((s) => ({ s, path: pathLabel(index, s.id).replaceAll(" / ", " › ") }))
    .filter(({ s, path }) => !q || s.name.toLowerCase().includes(q) || path.toLowerCase().includes(q));
  const row = "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-stone-50";
  return (
    <Popover
      align="left"
      className="w-80 max-w-[calc(100vw-2rem)]"
      trigger={({ toggle, open }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className={cx(inputClass, "flex items-center gap-2 text-left")}>
          <span className={cx("min-w-0 flex-1 truncate", !selected && "text-stone-500")}>{selected?.name ?? "All subtasks"}</span>
          <ChevronDown className={cx("size-4 shrink-0 text-stone-400 transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => {
        const choose = (id) => {
          onChange(id);
          setQuery("");
          close();
        };
        return (
          <>
            <label className="relative mb-1 block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subtasks…" className={cx(inputClass, "h-10 pl-9")} />
            </label>
            <ul className="max-h-72 overflow-y-auto scrollbar-thin">
              {!q && (
                <li>
                  <button type="button" onClick={() => choose("")} className={row}>
                    <span className="flex-1 text-sm font-semibold text-stone-700">All subtasks</span>
                    {!value && <Check className="size-4 shrink-0 text-brand-600" />}
                  </button>
                </li>
              )}
              {shown.map(({ s, path }) => (
                <li key={s.id}>
                  <button type="button" onClick={() => choose(s.id)} className={row}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-stone-800">{s.name}</span>
                      <span className="block truncate text-xs text-stone-400">{path}</span>
                    </span>
                    {value === s.id && <Check className="size-4 shrink-0 text-brand-600" />}
                  </button>
                </li>
              ))}
              {!shown.length && <li className="px-2.5 py-4 text-center text-sm text-stone-400">No subtasks match “{query}”.</li>}
            </ul>
          </>
        );
      }}
    </Popover>
  );
}

function Thumb({ url }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative block aspect-video bg-stone-200/60">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover transition group-hover:scale-[1.03]" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-stone-400">{failed ? <ImageOff className="size-5" /> : <Camera className="size-5 animate-pulse" />}</span>
      )}
    </span>
  );
}

/** One screenshot, large, with previous/next (arrow keys too). */
function Viewer({ shot, url, member, onClose, onPrev, onNext, needUrl, onDelete }) {
  useEffect(() => {
    needUrl(shot.path);
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const arrow = "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-30";
  return (
    <div role="dialog" aria-modal="true" aria-label="Screenshot" className="palette-fixed fixed inset-0 z-[80] flex flex-col bg-black/85 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mb-3 flex items-center gap-3 text-white">
        <Avatar member={member} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {member?.name ?? "Someone"} · {shot.client?.name ?? "Unknown client"}
          </p>
          <p className="truncate text-xs text-white/60">
            {shot.subtask?.name ?? "Subtask"}
            {shot.project ? ` (${shot.project.name})` : ""} · {formatDate(shot.takenAt, { weekday: "short", day: "numeric", month: "short" })} {formatTime(shot.takenAt)}
          </p>
        </div>
        {onDelete && <button type="button" onClick={onDelete} aria-label="Delete screenshot" title="Delete screenshot" className="grid size-10 place-items-center rounded-full bg-white/10 text-red-300 hover:bg-red-600 hover:text-white">
          <Trash className="size-5" />
        </button>}
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative grid min-h-0 flex-1 place-items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {url ? <img src={url} alt={`Screenshot from ${member?.name ?? "team member"}`} className="max-h-full max-w-full rounded-xl object-contain shadow-float" /> : <Camera className="size-8 animate-pulse text-white/50" />}
        <button type="button" aria-label="Previous" disabled={!onPrev} onClick={onPrev ?? undefined} className={cx(arrow, "left-2")}>
          <ChevronLeft className="size-6" />
        </button>
        <button type="button" aria-label="Next" disabled={!onNext} onClick={onNext ?? undefined} className={cx(arrow, "right-2")}>
          <ChevronRight className="size-6" />
        </button>
      </div>
    </div>
  );
}
