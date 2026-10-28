import { fromDateKey, shortDate, toDateKey, todayKey } from "../lib/time";

export const TYPES = ["client", "project", "task", "subtask"];
export const TYPE_LABEL = { client: "Client", project: "Project", task: "Task", subtask: "Subtask" };
export const CHILD_TYPE = { client: "project", project: "task", task: "subtask", subtask: null };
export const PARENT_TYPE = { client: null, project: "client", task: "project", subtask: "task" };

export const STATUSES = ["To do", "In progress", "In review", "Blocked", "Completed"];

/**
 * Statuses people can pick. "In progress" isn't one: it's set automatically when someone clocks in.
 * (A subtask already in progress still shows it, so the dropdown can display its current value.)
 */
export const statusChoices = (current) => STATUSES.filter((s) => s !== "In progress" || s === current);
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const PROJECT_STATUSES = ["Active", "On hold", "Completed"];

export const isWork = (item) => item?.type === "task" || item?.type === "subtask";

/*
 * Who is attached to work:
 *  - task:    createdBy only (set automatically to whoever creates it)
 *  - subtask: assignees (one or more other team members) + assignedBy (set automatically)
 */
export const hasAssignee = (item) => item?.type === "subtask";

/** Subtasks can have several people working on them. */
export const assigneesOf = (item) => (hasAssignee(item) ? item.assignees ?? [] : []);

/**
 * Upgrade older item shapes:
 *  - tasks had assignedTo/assignedBy; now only createdBy
 *  - subtasks had a single assignedTo; now an `assignees` list
 */
export function toTaskShape(item) {
  if (item.type === "task" && !("createdBy" in item)) {
    const { assignedTo: _to, assignedBy, ...rest } = item;
    return { ...rest, createdBy: assignedBy ?? null };
  }
  if (item.type === "subtask" && !Array.isArray(item.assignees)) {
    const { assignedTo, ...rest } = item;
    return { ...rest, assignees: assignedTo ? [assignedTo] : [] };
  }
  return item;
}
export const isDone = (item) => item?.status === "Completed";
export const isOverdue = (item, today = todayKey()) => isWork(item) && !isDone(item) && !!item.due && item.due < today;

/** Index the flat item list for fast parent/child lookups. */
export function buildIndex(items) {
  const byId = new Map();
  const children = new Map();
  for (const item of items) {
    byId.set(item.id, item);
    const key = item.parentId ?? "root";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(item);
  }
  return {
    byId,
    get: (id) => byId.get(id),
    childrenOf: (id) => children.get(id ?? "root") ?? [],
  };
}

/*
 * Billing: every task is billable or non-billable (set when created, never changed).
 * Subtasks belong to their task's category; a project holds both kinds.
 */
export const BILLING = ["billable", "non-billable"];
export const BILLING_LABEL = { billable: "Billable", "non-billable": "Non-billable" };

/** The billing category of a task or subtask (from its task). Null for clients and projects. */
export function billingOf(index, id) {
  const task = ancestry(index, id).find((x) => x.type === "task");
  return task ? task.billing ?? "billable" : null;
}

/** True when the item or any parent (client/project) has been archived by the admin. */
export const isArchived = (index, id) => ancestry(index, id).some((x) => x.archived);

/** A clocking's billing category: its own (if the admin moved it), else its task's. */
export const entryBilling = (index, entry) => entry.billing ?? billingOf(index, entry.subtaskId) ?? "billable";

/** [client, project, ...] down to and including the item. */
export function ancestry(index, id) {
  const chain = [];
  let cur = index.get(id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? index.get(cur.parentId) : null;
  }
  return chain;
}

export function pathLabel(index, id, { includeSelf = false } = {}) {
  const chain = ancestry(index, id);
  if (!includeSelf) chain.pop();
  return chain.map((x) => x.name).join(" / ");
}

/** The item itself plus everything below it. */
export function descendants(index, id) {
  const out = [];
  const walk = (itemId) => {
    const item = index.get(itemId);
    if (!item) return;
    out.push(item);
    index.childrenOf(itemId).forEach((c) => walk(c.id));
  };
  walk(id);
  return out;
}

export function subtaskIdsUnder(index, id) {
  return new Set(descendants(index, id).filter((x) => x.type === "subtask").map((x) => x.id));
}

/** Leaf work units: subtasks, plus tasks that have no subtasks. */
export function workUnitsUnder(index, id) {
  return descendants(index, id).filter(
    (x) => x.type === "subtask" || (x.type === "task" && index.childrenOf(x.id).length === 0),
  );
}

export function progressOf(index, id) {
  const units = workUnitsUnder(index, id);
  const done = units.filter(isDone).length;
  return { done, total: units.length, pct: units.length ? Math.round((done / units.length) * 100) : 0 };
}

export const entrySeconds = (entry, now = Date.now()) => Math.max(0, ((entry.end ?? now) - entry.start) / 1000);

export function sumSeconds(entries, now = Date.now()) {
  return entries.reduce((sum, e) => sum + entrySeconds(e, now), 0);
}

export function entriesUnder(index, entries, id) {
  const ids = subtaskIdsUnder(index, id);
  return entries.filter((e) => ids.has(e.subtaskId));
}

/** Map of itemId -> logged seconds, rolled up from subtasks to their ancestors. */
export function rollupSeconds(index, entries, now = Date.now()) {
  const totals = new Map();
  for (const e of entries) {
    const secs = entrySeconds(e, now);
    let cur = index.get(e.subtaskId);
    while (cur) {
      totals.set(cur.id, (totals.get(cur.id) ?? 0) + secs);
      cur = cur.parentId ? index.get(cur.parentId) : null;
    }
  }
  return totals;
}

/** Ids of every item that has someone clocked in on it or below it. */
export function liveItemIds(index, entries) {
  const ids = new Set();
  for (const e of entries) {
    if (e.end != null) continue;
    let cur = index.get(e.subtaskId);
    while (cur) {
      ids.add(cur.id);
      cur = cur.parentId ? index.get(cur.parentId) : null;
    }
  }
  return ids;
}

export const runningEntryOf =(entries, memberId) => entries.find((e) => e.memberId === memberId && e.end == null);

export function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)[0] : parts[0]?.[1] ?? "")).toUpperCase();
}

export function uid(prefix = "") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/*
 * Due-date nesting: a subtask is due on or before its task, and a task on or before its project.
 * `items` is the full item list (state.items), so hidden subtasks still count.
 */
const DUE_PARENT = { subtask: "task", task: "project" };
const DUE_CHILD = { project: "task", task: "subtask" };

/**
 * The allowed range for an item's due date.
 * `item` needs { type, parentId } and, when it already exists, { id }.
 * Returns { max, parentType, min, childType } — max/min are YYYY-MM-DD or null.
 */
export function dueLimits(items, item) {
  const parentType = DUE_PARENT[item.type] ?? null;
  const childType = DUE_CHILD[item.type] ?? null;
  const parent = parentType ? items.find((i) => i.id === item.parentId && i.type === parentType) : null;
  const min = item.id && childType
    ? items.filter((i) => i.type === childType && i.parentId === item.id && i.due).reduce((m, i) => (i.due > m ? i.due : m), "") || null
    : null;
  return { max: parent?.due || null, parentType, min, childType };
}

/** Why `due` isn't allowed for this item, or "" when it's fine. */
export function dueProblem(items, item, due) {
  if (!due) return "";
  const { max, parentType, min, childType } = dueLimits(items, item);
  if (max && due > max) return `Can't be after the ${parentType}'s due date (${shortDate(max)})`;
  if (min && due < min) return `Can't be before a ${childType}'s due date (${shortDate(min)}). Move that ${childType} earlier first.`;
  return "";
}

/* ---------- Client billing cycle ---------- */

/** "YYYY-MM-DD" + n months (day clamped to the month's length: 31 Jan + 1 month = 28/29 Feb). */
export function addMonthsKey(key, n) {
  const d = new Date(fromDateKey(key));
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toDateKey(d);
}

/**
 * Working days (Monday–Friday, minus `holidays`, a Set of "YYYY-MM-DD") from `fromKey` to `toKey`,
 * both included. 0 if the range is empty.
 */
export function workingDays(fromKey, toKey, holidays = new Set()) {
  let n = 0;
  for (let d = new Date(fromDateKey(fromKey)), end = fromDateKey(toKey); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(toDateKey(d))) n++;
  }
  return n;
}

/** The day before a "YYYY-MM-DD" key. */
export function dayBefore(key) {
  const d = new Date(fromDateKey(key));
  d.setDate(d.getDate() - 1);
  return toDateKey(d);
}

/**
 * A client's current billing cycle, or null if the client has no hours set.
 * Cycles repeat: start, start + N months, start + 2N months… The current one contains today
 * (or is the first one, if it hasn't started yet). `end` is the cycle's last day.
 */
export function clientCycle(client, today = todayKey()) {
  if (!client?.budgetHours) return null;
  const months = client.cycleMonths || 1;
  const first = client.cycleStart || toDateKey(client.createdAt ?? Date.now());
  let start = first;
  let prevStart = null;
  for (let k = 1; addMonthsKey(first, k * months) <= today; k++) {
    prevStart = start;
    start = addMonthsKey(first, k * months);
  }
  const end = dayBefore(addMonthsKey(start, months)); // the day before the next cycle starts
  // The cycle before this one, if there was one.
  const prev = prevStart ? { start: prevStart, end: dayBefore(start) } : null;
  return { start, end, months, hours: client.budgetHours, upcoming: today < start, prev };
}
/**
 * People who do the work: every team member, plus the admin once they've taken on work themself
 * (assigned to a subtask, or have logged time). Used for team lists, filters and charts.
 */
export function workingMembers(members, items = [], entries = []) {
  return members.filter(
    (m) => !m.isAdmin || entries.some((e) => e.memberId === m.id) || items.some((i) => i.type === "subtask" && (i.assignees ?? []).includes(m.id)),
  );
}