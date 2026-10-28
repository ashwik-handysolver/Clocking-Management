/*
 * Access rules for the signed-in user ("me").
 * Every visibility/assignment rule lives here — the UI only calls these functions.
 * An admin (member.isAdmin) runs the workspace: sets up clients and projects, sees the
 * whole team's time and activity, and corrects time records.
 */

export const isAdmin = (user) => !!user?.isAdmin;

/** People see their own clocked time; the admin sees everyone's. */
export const canSeeEntry = (user, entry) => isAdmin(user) || entry.memberId === user.id;

/** Only the admin edits or deletes time (anyone's; every change is recorded). Team members only start and stop their timer. */
export const canEditEntry = (user) => isAdmin(user);

/** Only the admin stops someone else's running timer (e.g. they forgot to clock out). */
export const canStopOthersTimer = (user) => isAdmin(user);

/** Clients and projects are archived (or deleted) by the admin; tasks and subtasks can be deleted by anyone who sees them. */
export const canArchive = (user, item) => isAdmin(user) && (item?.type === "client" || item?.type === "project");
/**
 * The admin deletes anything. A task can be deleted by whoever created it, a subtask by whoever assigned it,
 * and only while no time is logged on it (the database checks that part too).
 */
export const canDeleteItem = (user, item, hasTime = false) =>
  isAdmin(user) ||
  (!hasTime && ((item?.type === "task" && item.createdBy === user.id) || (item?.type === "subtask" && item.assignedBy === user.id)));

/**
 * Someone assigned a subtask by another person can only change its status. Whoever assigned it
 * (including yourself, for a subtask you took on) and the admin can change everything.
 */
export const isAssignedByOther = (user, item) =>
  item?.type === "subtask" && (item.assignees ?? []).includes(user.id) && creatorOf(item) !== user.id;
/** Who created a task or subtask (older subtasks may only have "assigned by"). */
export const creatorOf = (item) => item?.createdBy ?? item?.assignedBy;

/**
 * Task and subtask details (name, due date, priority, assignees…): only whoever created it, nobody else.
 * Clients and projects: the admin.
 */
export const canEditDetails = (user, item) => (isWork(item) ? creatorOf(item) === user.id : isAdmin(user));

/** Status: the creator, plus a subtask's assignees. */
export const canChangeStatus = (user, item) =>
  canEditDetails(user, item) || (item?.type === "subtask" && (item.assignees ?? []).includes(user.id));

const isWork = (item) => item?.type === "task" || item?.type === "subtask";

/** Everyone sees all clients, projects, tasks and subtasks (only assignees can clock in, see canClockOn). */
export const canSeeItem = () => true;

/** Only people assigned to a subtask can clock time on it. */
export const canClockOn = (user, subtask) =>
  subtask?.type === "subtask" && (subtask.assignees ?? []).includes(user.id);

/** Timer events reveal someone's clocked time, so only show your own (the admin sees all). */
export const canSeeActivity = (user, event) => isAdmin(user) || event.kind !== "timer" || event.memberId === user.id;

/** Clients and projects are set up by the admin; anyone can add tasks and subtasks. */
export const canCreate = (user, type) => isAdmin(user) || type === "task" || type === "subtask";

/** Only the admin decides how often screenshots are taken. */
export const canSetSnapshotInterval = (user) => isAdmin(user);

/** Only the admin logs time by hand (for any member assigned to the subtask). */
export const canLogManualTime = (user) => isAdmin(user);

/** Only the admin moves a clocking between billable and non-billable. */
export const canMoveEntryBilling = (user) => isAdmin(user);

/** Only whoever can edit a subtask's details can change who it's assigned to. */
export const canEditAssignees = (user, item) => canEditDetails(user, item);

/** Subtasks go to any team member, yourself included. Nobody assigns work to the admin, except the admin to themself. */
export const assignableMembers = (members, user) => members.filter((m) => !m.removedAt && (!m.isAdmin || (isAdmin(user) && m.id === user?.id)));
