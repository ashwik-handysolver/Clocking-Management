import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import AuthPage from "../components/AuthPage";
import { navigate } from "../lib/router";
import { openedFromRecoveryLink, supabase, supabaseConfigured } from "../lib/supabase";
import { loadAll, pushChanges, subscribeAll } from "./db";
import { formatHours, formatTime } from "../lib/time";
import { BILLING, billingOf, buildIndex, isArchived, descendants, dueProblem, entrySeconds, hasAssignee, uid } from "./model";
import {
  canArchive, canClockOn, canCreate, canDeleteItem, canEditAssignees, canEditDetails, canEditEntry, canLogManualTime, canMoveEntryBilling,
  canSeeActivity, canSeeEntry, canSeeItem, canSetSnapshotInterval, canStopOthersTimer, isAdmin,
} from "./permissions";

const MAX_ACTIVITY = 500;

function withLog(state, action, itemId, kind, text) {
  const entry = { id: `${action.logId}-${kind}`, itemId, memberId: state.currentUserId, at: action.at, kind, text };
  return { ...state, activity: [entry, ...state.activity].slice(0, MAX_ACTIVITY) };
}

const MAX_AUDIT = 1000;

/** "1h 30m · 27 Oct 09:00–10:30" — how an entry reads in the change history. */
function describeEntry(e) {
  const day = new Date(e.start).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${formatHours(entrySeconds(e))} · ${day} ${formatTime(e.start)}–${e.end ? formatTime(e.end) : "now"}`;
}

/** Record a change to someone's time (who did what to which entry), for the admin's history. */
function withAudit(state, action, entry, kind, text) {
  const row = {
    id: `${action.logId}-${kind}`, at: action.at, by: state.currentUserId,
    entryId: entry.id, memberId: entry.memberId, subtaskId: entry.subtaskId, kind, text,
  };
  return { ...state, audit: [row, ...(state.audit ?? [])].slice(0, MAX_AUDIT) };
}

/** Close the member's running timer (if any) at `at`. */
function stopRunning(state, memberId, at) {
  return state.entries.map((e) => (e.memberId === memberId && e.end == null ? { ...e, end: at } : e));
}

function reducer(state, action) {
  const memberName = (id) => state.members.find((m) => m.id === id)?.name ?? "someone";
  const user = state.members.find((m) => m.id === state.currentUserId) ?? { id: state.currentUserId };
  // Nobody assigns work to the admin account, except the admin to themself.
  const noAdmins = (ids) => (ids ?? []).filter((id) => !state.members.find((m) => m.id === id)?.isAdmin || (isAdmin(user) && id === user.id));

  switch (action.type) {
    case "addItem": {
      // Tasks record who created them; subtasks are "assigned by" whoever creates them.
      let item = action.item;
      if (!canCreate(user, item.type)) return state; // clients and projects: admin only
      if (item.type === "project" && !canSetSnapshotInterval(user)) delete item.snapshotIntervalMinutes;
      // Due dates nest: a subtask by its task, a task by its project.
      if (dueProblem(state.items, item, item.due)) return state;
      if (item.type === "task") {
        const { assignedTo: _to, assignedBy: _by, ...rest } = item;
        item = { ...rest, createdBy: state.currentUserId, billing: BILLING.includes(item.billing) ? item.billing : "billable" };
      } else if (item.type === "subtask") {
        const { assignedTo: _legacy, ...rest } = item;
        item = { ...rest, assignees: noAdmins(item.assignees), assignedBy: state.currentUserId };
      }
      return withLog({ ...state, items: [...state.items, item] }, action, item.id, "created", `created this ${item.type}`);
    }

    case "updateItem": {
      const old = state.items.find((i) => i.id === action.id);
      if (!old) return state;
      // createdBy / assignedBy are never edited directly. Only subtasks have assignees;
      // changing who's on one makes you the assigner.
      const { assignedBy: _by, createdBy: _created, assignedTo: _legacy, billing: _billing, archived: _archived, ...all } = action.changes;
      // Assigned a subtask by someone else? Then only its status can change.
      const c = canEditDetails(user, old) ? all : "status" in all ? { status: all.status } : {};
      if (!Object.keys(c).length) return state;
      if (c.assignees) c.assignees = noAdmins(c.assignees);
      // Billing never changes: a subtask can't move to a task of the other category.
      if (c.parentId && c.parentId !== old.parentId && old.type === "subtask") {
        const index = buildIndex(state.items);
        if (billingOf(index, c.parentId) !== billingOf(index, old.id)) delete c.parentId;
      }
      if (!hasAssignee(old) || !canEditAssignees(user, old)) delete c.assignees;
      if (!canSetSnapshotInterval(user)) delete c.snapshotIntervalMinutes;
      if (dueProblem(state.items, { ...old, parentId: c.parentId ?? old.parentId }, c.due ?? old.due)) delete c.due;
      const assigneesChanged = c.assignees && [...c.assignees].sort().join() !== [...(old.assignees ?? [])].sort().join();
      if (assigneesChanged) c.assignedBy = state.currentUserId;
      const next = { ...state, items: state.items.map((i) => (i.id === action.id ? { ...i, ...c } : i)) };
      if (c.status && c.status !== old.status) return withLog(next, action, action.id, "status", `changed status to ${c.status}`);
      if (assigneesChanged)
        return withLog(next, action, action.id, "assign", `assigned this to ${c.assignees.map(memberName).join(", ") || "nobody"}`);
      if (c.priority && c.priority !== old.priority) return withLog(next, action, action.id, "edit", `set priority to ${c.priority}`);
      return withLog(next, action, action.id, "edit", "updated the details");
    }

    case "deleteItem": {
      const index = buildIndex(state.items);
      const target = index.get(action.id);
      const ids = new Set(descendants(index, action.id).map((x) => x.id));
      const hasTime = state.entries.some((e) => ids.has(e.subtaskId));
      if (!target || !canDeleteItem(user, target, hasTime)) return state;
      const next = {
        ...state,
        items: state.items.filter((i) => !ids.has(i.id)),
        entries: state.entries.filter((e) => !ids.has(e.subtaskId)),
        activity: state.activity.filter((a) => !ids.has(a.itemId)),
      };
      return target.parentId ? withLog(next, action, target.parentId, "delete", `deleted ${target.type} “${target.name}”`) : next;
    }

    // Admin: hide a finished client or project (and everything in it) without losing its time.
    case "archiveItem": {
      const target = state.items.find((i) => i.id === action.id);
      if (!canArchive(user, target)) return state;
      const next = { ...state, items: state.items.map((i) => (i.id === action.id ? { ...i, archived: action.archived } : i)) };
      return withLog(next, action, action.id, "edit", action.archived ? `archived this ${target.type}` : `restored this ${target.type}`);
    }

    // Timers and time entries always belong to the signed-in user.
    case "startTimer": {
      const memberId = state.currentUserId;
      const sub = state.items.find((i) => i.id === action.subtaskId);
      if (!canClockOn({ id: memberId }, sub)) return state; // only assignees can clock in
      const entry = { id: action.entryId, subtaskId: action.subtaskId, memberId, start: action.at, end: null, note: "", source: "timer" };
      if (action.screenCapture) entry.screenCapture = true; // screenshots are taken while this runs
      // Starting work moves a "To do" subtask (and its task) into progress.
      const items = state.items.map((i) =>
        (i.id === sub?.id || i.id === sub?.parentId) && i.status === "To do" ? { ...i, status: "In progress" } : i,
      );
      const next = { ...state, items, entries: [...stopRunning(state, memberId, action.at), entry] };
      return withLog(next, action, action.subtaskId, "timer", "started the timer");
    }

    case "stopTimer": {
      const memberId = state.currentUserId;
      const running = state.entries.find((e) => e.memberId === memberId && e.end == null);
      if (!running) return state;
      const next = { ...state, entries: stopRunning(state, memberId, action.at) };
      const spent = formatHours(entrySeconds({ ...running, end: action.at }));
      return withLog(next, action, running.subtaskId, "timer", `stopped the timer · logged ${spent}`);
    }

    case "addEntry": {
      // Manual time is logged by the admin, for a member assigned to the subtask.
      if (!canLogManualTime(user)) return state;
      const entry = { ...action.entry, source: "manual", loggedBy: user.id };
      if (!canClockOn({ id: entry.memberId }, state.items.find((i) => i.id === entry.subtaskId))) return state;
      const next = { ...state, entries: [...state.entries, entry] };
      const spent = formatHours(entrySeconds(entry));
      const logged = withLog(next, action, entry.subtaskId, "timer", `logged ${spent} manually for ${memberName(entry.memberId)}`);
      return withAudit(logged, action, entry, "logged", `Logged ${describeEntry(entry)}`);
    }

    // Admin: move a clocking between billable and non-billable (its task's category stays).
    case "setEntryBilling": {
      const old = state.entries.find((e) => e.id === action.id);
      if (!old || !canMoveEntryBilling(user) || !BILLING.includes(action.billing)) return state;
      const next = { ...state, entries: state.entries.map((e) => (e.id === action.id ? { ...e, billing: action.billing } : e)) };
      return withAudit(next, action, old, "billing", `Moved ${describeEntry(old)} to ${action.billing}`);
    }

    case "updateEntry": {
      const old = state.entries.find((e) => e.id === action.id);
      if (!old || !canEditEntry(user, old)) return state;
      const { memberId: _ignored, billing: _billing, ...changes } = action.changes;
      const updated = { ...old, ...changes };
      const next = { ...state, entries: state.entries.map((e) => (e.id === action.id ? updated : e)) };
      // Corrections to someone else's time are recorded.
      if (old.memberId === user.id) return next;
      // Say what changed: times, subtask, note.
      const parts = [];
      if (describeEntry(old) !== describeEntry(updated)) parts.push(`${describeEntry(old)} → ${describeEntry(updated)}`);
      if (updated.subtaskId !== old.subtaskId) {
        const name = (id) => state.items.find((i) => i.id === id)?.name ?? "a deleted subtask";
        parts.push(`moved from “${name(old.subtaskId)}” to “${name(updated.subtaskId)}”`);
      }
      if ((updated.note ?? "") !== (old.note ?? "")) parts.push(updated.note ? `note set to “${updated.note}”` : "note removed");
      if (!parts.length) return next;
      const what = describeEntry(old) === describeEntry(updated) ? `${describeEntry(old)}: ` : "";
      return withAudit(next, action, updated, "edited", `Edited ${what}${parts.join("; ")}`);
    }

    case "deleteEntry": {
      const old = state.entries.find((e) => e.id === action.id);
      if (!old || !canEditEntry(user, old)) return state;
      const next = { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
      return old.memberId === user.id ? next : withAudit(next, action, old, "deleted", `Deleted ${describeEntry(old)}`);
    }

    // Admin: stop a member's running timer (they forgot to clock out).
    case "stopMemberTimer": {
      const running = state.entries.find((e) => e.memberId === action.memberId && e.end == null);
      if (!running || !canStopOthersTimer(user)) return state;
      const stopped = { ...running, end: action.at };
      const next = { ...state, entries: state.entries.map((e) => (e.id === running.id ? stopped : e)) };
      const logged = withLog(next, action, running.subtaskId, "timer", `stopped ${memberName(action.memberId)}'s timer · ${formatHours(entrySeconds(stopped))}`);
      return withAudit(logged, action, stopped, "stopped", `Stopped the timer · ${describeEntry(stopped)}`);
    }

    case "addComment":
      return withLog(state, action, action.itemId, "comment", action.text);

    case "addMember":
      return { ...state, members: [...state.members, action.member] };

    case "updateMember": {
      const { isAdmin: _role, ...changes } = action.changes;
      return { ...state, members: state.members.map((m) => (m.id === action.id ? { ...m, ...changes } : m)) };
    }

    // Fresh data from Supabase (first load, or someone changed something).
    case "hydrate":
      return { ...action.state, currentUserId: state.currentUserId };

    // The result of an action, already worked out by send() (see StoreProvider).
    case "replace":
      return action.state;

    case "signedIn":
      return { ...state, currentUserId: action.memberId };

    default:
      return state;
  }
}

const StoreContext = createContext(null);

const EMPTY = { members: [], items: [], entries: [], activity: [], audit: [], holidays: [], currentUserId: null };

/**
 * Data lives in Supabase. Each action updates the screen straight away, then the change is
 * written to the database; any change (yours or a teammate's) arrives back over Realtime
 * and reloads the data, so every open screen stays current.
 */
export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [status, setStatus] = useState(supabaseConfigured ? "loading" : "unconfigured"); // loading | signedOut | noMember | ready | error | unconfigured
  const [problem, setProblem] = useState("");
  const [recovering, setRecovering] = useState(openedFromRecoveryLink); // signed in from a reset link, new password not set yet
  const latest = useRef(state);
  latest.current = state;
  const authId = useRef(null);

  // Writes still on their way to Supabase. A reload while any are pending would briefly show
  // the old data (the change "jumps back"), so reloads wait until the queue is empty.
  const pending = useRef(0);
  const reloadWanted = useRef(false);
  const ready = useRef(false);
  // One device per account (first sign-in wins). `claim` = this load follows a fresh sign-in.
  const claim = useRef(false);
  const [signedOutReason, setSignedOutReason] = useState("");
  const kickOut = useCallback(async (reason) => {
    setSignedOutReason(reason);
    await supabase.auth.signOut({ scope: "local" }); // this device only
  }, []);

  const reload = useCallback(async () => {
    if (pending.current > 0) {
      reloadWanted.current = true;
      return;
    }
    try {
      const data = await loadAll();
      if (pending.current > 0) {
        reloadWanted.current = true; // a write started meanwhile; this data may be stale
        return;
      }
      const member = data.members.find((m) => m.authUserId === authId.current);
      // First load after signing in: make sure no other device is using this account.
      if (member && !ready.current) {
        const verdict = await checkDevice(claim.current);
        claim.current = false;
        if (verdict === "busy") return kickOut("This account is already signed in on another device. Sign out there first, then sign in here.");
        if (verdict === "replaced") return kickOut("You were signed out because this account is now in use on another device.");
      }
      dispatch({ type: "hydrate", state: data });
      if (!member) return setStatus("noMember");
      dispatch({ type: "signedIn", memberId: member.id });
      ready.current = true;
      setStatus("ready");
    } catch (err) {
      // Background refresh failed (e.g. offline): keep showing what we have; only a failed first load shows the error screen.
      if (ready.current) {
        console.warn("Refresh failed", err);
        return;
      }
      setProblem(err.message ?? String(err));
      setStatus("error");
    }
  }, [kickOut]);

  // Follow the Supabase session: load data when someone is signed in.
  useEffect(() => {
    if (!supabaseConfigured) return;
    const onSession = (session) => {
      authId.current = session?.user?.id ?? null;
      if (!authId.current) {
        ready.current = false;
        dispatch({ type: "hydrate", state: EMPTY });
        return setStatus("signedOut");
      }
      reload();
    };
    supabase.auth.getSession().then(({ data }) => onSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true); // opened a reset-password link: choose a new password first
      // A fresh sign-in (not a page refresh): start on the dashboard.
      if (event === "SIGNED_IN" && !authId.current && session) {
        navigate("dashboard");
        newLoginId(); // this sign-in claims the account for this device
        claim.current = true;
        setSignedOutReason("");
      }
      if (event !== "INITIAL_SESSION") onSession(session);
    });
    return () => data.subscription.unsubscribe();
  }, [reload]);

  // While signed in, keep this device's hold on the account fresh (and notice if it was lost).
  useEffect(() => {
    if (status !== "ready") return;
    const ping = async () => {
      if (document.visibilityState !== "visible") return;
      const verdict = await checkDevice(false).catch(() => "ok");
      if (verdict === "replaced") kickOut("You were signed out because this account is now in use on another device.");
    };
    const timer = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [status, kickOut]);

  // Live updates: reload (debounced) whenever any table changes.
  useEffect(() => {
    if (status !== "ready") return;
    let timer;
    const off = subscribeAll(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, 300);
    });
    // After sleep or a dropped connection, live updates may have been missed: refresh when the tab
    // comes back into view or the network returns.
    const refresh = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearTimeout(timer);
      off();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [status === "ready", reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useMemo(() => {
    // Ids and timestamps are made here so the reducer stays pure.
    // Writes go out one at a time so they reach the database in the order they happened.
    let queue = Promise.resolve();
    const send = (action) => {
      const prev = latest.current;
      const next = reducer(prev, { at: Date.now(), logId: uid("a"), ...action });
      if (next === prev) return;
      latest.current = next;
      dispatch({ type: "replace", state: next });
      pending.current++;
      queue = queue
        .then(() => pushChanges(prev, next))
        .catch((err) => {
          console.error("Couldn't save to Supabase", err);
          window.dispatchEvent(new CustomEvent("store:save-failed", { detail: err.message ?? String(err) }));
          reloadWanted.current = true; // put the screen back in line with the database
        })
        .finally(() => {
          pending.current--;
          if (pending.current === 0 && reloadWanted.current) {
            reloadWanted.current = false;
            reload();
          }
        });
    };
    return {
      addItem(fields) {
        const item = { ...fields, id: uid(fields.type[0]), createdAt: Date.now() };
        send({ type: "addItem", item });
        return item.id;
      },
      updateItem: (id, changes) => send({ type: "updateItem", id, changes }),
      deleteItem: (id) => send({ type: "deleteItem", id }),
      // UI should clock in/out through useClock() (components/clock.jsx), which handles screenshots.
      // Returns the new clocking's id (the tab that clocks in captures screenshots for that clocking only).
      startTimer(subtaskId, { screenCapture = false } = {}) {
        const entryId = uid("e");
        send({ type: "startTimer", subtaskId, screenCapture, entryId });
        return entryId;
      },
      stopTimer: (at) => send({ type: "stopTimer", ...(at && { at }) }),
      addEntry: (entry) => send({ type: "addEntry", entry: { source: "manual", note: "", ...entry, id: uid("e") } }),
      setEntryBilling: (id, billing) => send({ type: "setEntryBilling", id, billing }),
      stopMemberTimer: (memberId) => send({ type: "stopMemberTimer", memberId }),
      archiveItem: (id, archived = true) => send({ type: "archiveItem", id, archived }),
      updateEntry: (id, changes) => send({ type: "updateEntry", id, changes }),
      deleteEntry: (id) => send({ type: "deleteEntry", id }),
      addComment: (itemId, text) => send({ type: "addComment", itemId, text }),
      addMember(fields) {
        const member = { ...fields, id: uid("m") };
        send({ type: "addMember", member });
        return member.id;
      },
      updateMember: (id, changes) => send({ type: "updateMember", id, changes }),
      // Signing out clocks you out first, and waits until that is saved (afterwards the database would refuse it).
      async signOut() {
        send({ type: "stopTimer" });
        await queue.catch(() => {});
        await releaseDevice(); // free the account for another device
        await supabase.auth.signOut({ scope: "local" }); // this device only
      },
    };
  }, [reload]);

  const memberById = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members]);
  const me = memberById.get(state.currentUserId) ?? state.members[0];

  /*
   * What the signed-in user may see (store/permissions.js). UI code reads `items`, `index`,
   * `entries` and `activity` from here — never state.items / state.entries / state.activity.
   */
  const seen = useMemo(() => state.items.filter((i) => canSeeItem(me, i)), [state.items, me]);
  // `allIndex` includes archived clients/projects (for naming old time); `items`/`index` leave them out.
  const allIndex = useMemo(() => buildIndex(seen), [seen]);
  const items = useMemo(() => seen.filter((i) => !isArchived(allIndex, i.id)), [seen, allIndex]);
  const index = useMemo(() => buildIndex(items), [items]);
  const audit = useMemo(() => (isAdmin(me) ? state.audit ?? [] : []), [state.audit, me]);
  // `entries` is always your own time; `teamEntries` is everything you may see (everyone's, for the admin).
  const entries = useMemo(() => state.entries.filter((e) => e.memberId === me.id), [state.entries, me]);
  const teamEntries = useMemo(() => state.entries.filter((e) => canSeeEntry(me, e)), [state.entries, me]);
  const activity = useMemo(() => state.activity.filter((a) => canSeeActivity(me, a)), [state.activity, me]);

  const value = useMemo(
    () => ({ state, items, index, allIndex, actions, memberById, me, entries, teamEntries, activity, audit }),
    [state, items, index, allIndex, actions, memberById, me, entries, teamEntries, activity, audit],
  );

  if (recovering && status !== "signedOut" && status !== "unconfigured") return <AuthPage mode="recovery" onRecovered={() => setRecovering(false)} />;
  if (status === "signedOut") return <AuthPage notice={signedOutReason} />;
  if (status !== "ready" || !me) return <StoreStatus status={status} problem={problem} onRetry={reload} />;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

/** What shows instead of the app until a signed-in team member's data has loaded. */
const STATUS_TEXT = {
  loading: ["Loading your workspace…", ""],
  unconfigured: ["Supabase isn't set up", "Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server."],
  signedOut: ["You're not signed in", "Sign in to see your work."],
  noMember: ["No team member linked to this account", "Your account has no team member profile yet. Try again in a moment, or ask the admin."],
  error: ["Couldn't load your workspace", ""],
};

function StoreStatus({ status, problem, onRetry }) {
  const [title, text] = STATUS_TEXT[status] ?? STATUS_TEXT.loading;
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
      <div className="max-w-sm">
        {status === "loading" && <span className="mx-auto mb-4 block size-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />}
        <h1 className="text-lg font-extrabold text-stone-900">{title}</h1>
        {(text || problem) && <p className="mt-1.5 text-sm text-stone-500">{status === "error" ? problem : text}</p>}
        {(status === "error" || status === "noMember") && (
          <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={onRetry} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
            Try again
          </button>
          <button type="button" onClick={async () => { await releaseDevice(); await supabase.auth.signOut({ scope: "local" }); }} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100">
            Sign out
          </button>
          </div>
        )}
      </div>
    </div>
  );
}
/* ---------- One device per account ---------- */

const LOGIN_KEY = "handysolver-login-id";

/** A new id for this device's sign-in (kept in this browser, shared by its tabs). */
function newLoginId() {
  const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
  try {
    localStorage.setItem(LOGIN_KEY, id);
  } catch {
    /* private mode: works for this visit */
  }
  return id;
}
function loginId() {
  try {
    return localStorage.getItem(LOGIN_KEY) || newLoginId();
  } catch {
    return newLoginId();
  }
}

/** "ok" | "busy" (another device holds the account) | "replaced" (another device took over). */
async function checkDevice(claim) {
  const device = `${navigator.platform || "device"} · ${navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] ?? "browser"}`;
  const { data, error } = await supabase.rpc("session_check", { p_session: loginId(), p_device: device, p_claim: claim });
  if (error) {
    console.warn("Device check failed", error);
    return "ok"; // don't lock people out over a network hiccup
  }
  return data;
}

async function releaseDevice() {
  await supabase.rpc("session_release", { p_session: loginId() }).then(() => {}, () => {});
}