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
import { AdminPage, Pager } from "./AdminPage";

/*
 * Screenshots (admin only): filter by client, team member and date range, or open it for one task
 * or subtask (#/screenshots?task=<id> or ?subtask=<id>) from that item's page.
 * Images live in the private "snapshots" bucket; the page shows them through
 * short-lived signed links, one page of thumbnails at a time.
 */

const PER_PAGE = 24;

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
  const [from, setFrom] = useState(() => toDateKey(scope?.createdAt ?? startOfWeek(Date.now())));
  const [to, setTo] = useState(() => toDateKey(Date.now()));
  const [page, setPage] = useState(0);
  const [shots, setShots] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [urls, setUrls] = useState(new Map());
  const [open, setOpen] = useState(null); // index into `filtered` shown large
  const { confirm, toast } = useDialogs();

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

  // Client comes from the clocking the screenshot was taken during.
  const entryById = useMemo(() => new Map(teamEntries.map((e) => [e.id, e])), [teamEntries]);
  const filtered = useMemo(
    () =>
      (shots ?? [])
        .map((s) => {
          const entry = entryById.get(s.entryId);
          const chain = entry ? ancestry(index, entry.subtaskId) : [];
          return { ...s, chain, subtask: chain.find((x) => x.type === "subtask"), client: chain.find((x) => x.type === "client") };
        })
        // Team members: only screenshots from subtasks they're assigned to.
        .filter((s) => admin || (s.subtask && assigneesOf(s.subtask).includes(me.id)))
        .filter((s) => !clientId || s.client?.id === clientId)
        .filter((s) => !subtaskId || s.subtask?.id === subtaskId)
        .filter((s) => !scopeId || s.chain.some((x) => x.id === scopeId)),
    [shots, entryById, index, clientId, subtaskId, scopeId, admin, me.id],
  );

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
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const visible = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  // Signed links for the thumbnails on this page.
  const visibleKey = visible.map((s) => s.path).join("|");
  useEffect(() => {
    const missing = visible.map((s) => s.path).filter((p) => !urls.has(p));
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

  const resetPage = (fn) => (e) => {
    fn(e.target.value);
    setPage(0);
  };

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
            <input type="date" value={from} max={to} onChange={resetPage(setFrom)} className={inputClass} />
          </Field>
          <Field label="To">
            <input type="date" value={to} min={from} onChange={resetPage(setTo)} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 @md:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-stone-700">{shots == null ? "Loading…" : `${filtered.length} screenshot${filtered.length === 1 ? "" : "s"}`}</p>
          <Pager page={page} total={filtered.length} perPage={PER_PAGE} onPage={setPage} />
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {shots != null && !filtered.length ? (
          <EmptyState icon={Camera} title="No screenshots for these filters" />
        ) : (
          <ul className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4">
            {visible.map((s, i) => (
              <li key={s.id} className="group/shot relative">
                {/* Delete (admin): shows on hover (and keyboard focus) */}
                {admin && (
                <button
                  type="button"
                  onClick={() => askDelete(s)}
                  aria-label={`Delete screenshot from ${formatDate(s.takenAt)} ${formatTime(s.takenAt)}`}
                  title="Delete screenshot"
                  className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-xl bg-white/95 text-red-600 opacity-0 shadow-soft ring-1 ring-stone-900/10 transition group-hover/shot:opacity-100 hover:bg-red-600 hover:text-white focus-visible:opacity-100"
                >
                  <Trash className="size-4" />
                </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(page * PER_PAGE + i)}
                  className="group block w-full overflow-hidden rounded-2xl bg-stone-50 text-left ring-1 ring-stone-900/5 transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-brand-200"
                >
                  <Thumb url={urls.get(s.path)} />
                  <span className="flex items-center gap-2 p-2.5">
                    <Avatar member={memberById.get(s.memberId)} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-stone-800">{s.client?.name ?? "Unknown client"}</span>
                      <span className="block truncate text-[11px] text-stone-500">
                        {formatDate(s.takenAt)} · {formatTime(s.takenAt)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open != null && filtered[open] && (
        <Viewer
          shot={filtered[open]}
          url={urls.get(filtered[open].path)}
          member={memberById.get(filtered[open].memberId)}
          onClose={() => setOpen(null)}
          onPrev={open > 0 ? () => setOpen(open - 1) : null}
          onNext={open < filtered.length - 1 ? () => setOpen(open + 1) : null}
          needUrl={(path) => !urls.has(path) && snapshotUrls([path]).then((m) => setUrls((old) => new Map([...old, ...m])))}
          onDelete={admin ? () => {
            const s = filtered[open];
            setOpen(null); // close the viewer so the confirmation shows on top
            askDelete(s);
          } : null}
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
            {shot.subtask?.name ?? "Subtask"} · {formatDate(shot.takenAt, { weekday: "short", day: "numeric", month: "short" })} {formatTime(shot.takenAt)}
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
