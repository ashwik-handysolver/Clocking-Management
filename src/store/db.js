import { supabase } from "../lib/supabase";

/*
 * Supabase <-> app data. The app works with camelCase objects and millisecond timestamps;
 * the database uses snake_case columns and timestamptz. Everything that touches the
 * tables goes through this file.
 *
 * Who may read or change what is enforced by Row Level Security in the database, so
 * every query here simply returns what the signed-in user is allowed to see.
 */

const ms = (v) => (v == null ? null : Date.parse(v));
const iso = (v) => (v == null ? null : new Date(v).toISOString());

/* ---------- Row mapping ---------- */

const memberFrom = (r) => ({
  id: r.id, authUserId: r.auth_user_id, name: r.name, role: r.role, email: r.email, color: r.color, isAdmin: r.is_admin,
  removedAt: r.removed_at ? Date.parse(r.removed_at) : null, createdAt: ms(r.created_at), avatarUrl: r.avatar_url ?? "", phone: r.phone ?? "",
});
const memberTo = (m) => ({
  id: m.id, name: m.name, role: m.role ?? "", email: m.email, color: m.color, removed_at: m.removedAt ? iso(m.removedAt) : null,
  avatar_url: m.avatarUrl || null, phone: m.phone || null,
  is_admin: !!m.isAdmin, // only takes effect when the admin changes someone else (database guard)
});

const itemFrom = (r) => ({
  id: r.id, type: r.type, parentId: r.parent_id, name: r.name, description: r.description, status: r.status ?? undefined,
  priority: r.priority ?? undefined, due: r.due ?? "", estimate: r.estimate == null ? undefined : Number(r.estimate), tags: r.tags,
  assignees: r.assignees, assignedBy: r.assigned_by ?? undefined, createdBy: r.created_by ?? undefined, billing: r.billing ?? undefined,
  archived: r.archived, snapshotIntervalMinutes: r.snapshot_interval_minutes ?? undefined, contactName: r.contact_name ?? "",
  contactEmail: r.contact_email ?? "", createdAt: ms(r.created_at),
  budgetHours: r.budget_hours == null ? undefined : Number(r.budget_hours), cycleStart: r.cycle_start ?? "", cycleMonths: r.cycle_months ?? undefined,
});
const itemTo = (i) => ({
  id: i.id, type: i.type, parent_id: i.parentId ?? null, name: i.name, description: i.description ?? "", status: i.status ?? null,
  priority: i.priority ?? null, due: i.due || null, estimate: i.estimate === "" || i.estimate == null ? null : Number(i.estimate),
  tags: i.tags ?? [], assignees: i.assignees ?? [], assigned_by: i.assignedBy ?? null, created_by: i.createdBy ?? null,
  billing: i.billing ?? null, archived: !!i.archived, snapshot_interval_minutes: i.snapshotIntervalMinutes ?? null,
  contact_name: i.contactName || null, contact_email: i.contactEmail || null,
  budget_hours: i.budgetHours === "" || i.budgetHours == null ? null : Number(i.budgetHours), cycle_start: i.cycleStart || null,
  cycle_months: i.cycleMonths === "" || i.cycleMonths == null ? null : Number(i.cycleMonths), ...(i.createdAt && { created_at: iso(i.createdAt) }),
});

const entryFrom = (r) => ({
  id: r.id, subtaskId: r.subtask_id, memberId: r.member_id, start: ms(r.start_at), end: ms(r.end_at), note: r.note, source: r.source,
  billing: r.billing ?? undefined, screenCapture: r.screen_capture, loggedBy: r.logged_by ?? undefined,
});
const entryTo = (e) => ({
  id: e.id, subtask_id: e.subtaskId, member_id: e.memberId, start_at: iso(e.start), end_at: iso(e.end), note: e.note ?? "",
  source: e.source ?? "timer", billing: e.billing ?? null, screen_capture: !!e.screenCapture, logged_by: e.loggedBy ?? null,
});

const activityFrom = (r) => ({ id: r.id, itemId: r.item_id, memberId: r.member_id, at: ms(r.at), kind: r.kind, text: r.text });
const activityTo = (a) => ({ id: a.id, item_id: a.itemId, member_id: a.memberId, at: iso(a.at), kind: a.kind, text: a.text ?? "" });

const auditFrom = (r) => ({
  id: r.id, at: ms(r.at), by: r.by_member, entryId: r.entry_id, memberId: r.member_id, subtaskId: r.subtask_id, kind: r.kind, text: r.text,
});
const auditTo = (a) => ({
  id: a.id, at: iso(a.at), by_member: a.by, entry_id: a.entryId, member_id: a.memberId, subtask_id: a.subtaskId, kind: a.kind, text: a.text,
});

/* ---------- Load ---------- */

const MAX_ACTIVITY = 500;
const MAX_AUDIT = 1000;

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Everything the signed-in user may see. */
export async function loadAll() {
  const [members, items, entries, activity, audit, holidays] = await Promise.all([
    supabase.from("members").select("*").order("created_at"),
    supabase.from("items").select("*").order("created_at"),
    supabase.from("time_entries").select("*").order("start_at"),
    supabase.from("activity").select("*").order("at", { ascending: false }).limit(MAX_ACTIVITY),
    supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(MAX_AUDIT),
    supabase.from("holidays").select("*").order("day"),
  ]);
  return {
    members: check(members).map(memberFrom),
    items: check(items).map(itemFrom),
    entries: check(entries).map(entryFrom),
    activity: check(activity).map(activityFrom),
    audit: check(audit).map(auditFrom),
    holidays: check(holidays).map((r) => ({ day: r.day, name: r.name })),
  };
}

/* ---------- Save: push the difference between two states ---------- */

const TYPE_RANK = { client: 0, project: 1, task: 2, subtask: 3 };

function diff(prev = [], next = []) {
  const before = new Map(prev.map((x) => [x.id, x]));
  const after = new Map(next.map((x) => [x.id, x]));
  return {
    added: next.filter((x) => !before.has(x.id)),
    changed: next.filter((x) => before.has(x.id) && before.get(x.id) !== x),
    removed: prev.filter((x) => !after.has(x.id)),
  };
}

/**
 * Delete rows and make sure they really went: when access rules refuse a delete, Supabase
 * reports success with nothing deleted. (Rows already removed by a parent's delete count as gone.)
 */
async function deleteAll(table, rows) {
  const ids = rows.map((r) => r.id);
  const deleted = check(await supabase.from(table).delete().in("id", ids).select("id"));
  if (deleted.length < ids.length) {
    const left = check(await supabase.from(table).select("id").in("id", ids));
    if (left.length) throw new Error("you don't have permission to delete this, or it has logged time");
  }
}

const updateEach = (table, rows, to) => Promise.all(rows.map((r) => supabase.from(table).update(to(r)).eq("id", r.id).then(check)));

/**
 * Write what changed between `prev` and `next` (the app state before and after one action).
 * Order matters: parents before children, a stopped timer before the new one starts.
 */
export async function pushChanges(prev, next) {
  const members = diff(prev.members, next.members);
  const items = diff(prev.items, next.items);
  const entries = diff(prev.entries, next.entries);
  const activity = diff(prev.activity, next.activity).added; // the activity feed and change history are append-only
  const audit = diff(prev.audit, next.audit).added;

  if (members.added.length) check(await supabase.from("members").insert(members.added.map(memberTo)));
  await updateEach("members", members.changed, memberTo);

  const byRank = (a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type];
  for (const item of [...items.added].sort(byRank)) check(await supabase.from("items").insert(itemTo(item)));
  await updateEach("items", items.changed, itemTo);

  await updateEach("time_entries", entries.changed, entryTo); // e.g. the previous timer stops first
  if (entries.added.length) check(await supabase.from("time_entries").insert(entries.added.map(entryTo)));
  if (entries.removed.length) await deleteAll("time_entries", entries.removed);

  // Deleting a parent removes its children (and their time) in the database too.
  if (items.removed.length) await deleteAll("items", items.removed);

  if (activity.length) check(await supabase.from("activity").insert(activity.map(activityTo)));
  if (audit.length) check(await supabase.from("audit_log").insert(audit.map(auditTo)));
}

/** Calls `onChange` whenever any table changes (Supabase Realtime over a WebSocket). Returns an unsubscribe function. */
export function subscribeAll(onChange) {
  const channel = supabase.channel("workspace");
  for (const table of ["members", "items", "time_entries", "activity", "audit_log", "holidays"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

/* ---------- Clock-in check-ins ---------- */

/** "Still clocked in": sent every ~30 s by the tab that is sharing its screen. */
export async function sendBeat(memberId, entryId, deviceId) {
  const { error } = await supabase
    .from("clock_beats")
    .upsert({ member_id: memberId, entry_id: entryId, device_id: deviceId, beat_at: new Date().toISOString() });
  if (error) throw error;
}

/** The latest check-in for a member: { entryId, deviceId, beatAt (ms) } or null. */
export async function readBeat(memberId) {
  const { data, error } = await supabase.from("clock_beats").select("*").eq("member_id", memberId).maybeSingle();
  if (error) throw error;
  return data && { entryId: data.entry_id, deviceId: data.device_id, beatAt: Date.parse(data.beat_at) };
}
/* ---------- Screenshots (admin only, enforced by RLS) ---------- */

/** Screenshot records, newest first, optionally for one member and a time range [from, to). */
export async function listSnapshots({ memberId, from, to } = {}) {
  let q = supabase.from("snapshots").select("*").order("taken_at", { ascending: false }).limit(2000);
  if (memberId) q = q.eq("member_id", memberId);
  if (from) q = q.gte("taken_at", iso(from));
  if (to) q = q.lt("taken_at", iso(to));
  return check(await q).map((r) => ({ id: r.id, memberId: r.member_id, entryId: r.entry_id, takenAt: ms(r.taken_at), path: r.storage_path }));
}

/** Short-lived links to view the images (the bucket is private). Returns Map(path → url). */
export async function snapshotUrls(paths) {
  if (!paths.length) return new Map();
  const { data, error } = await supabase.storage.from("snapshots").createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
/* ---------- Holidays (admin manages, everyone reads) ---------- */

export async function saveHoliday(day, name) {
  check(await supabase.from("holidays").upsert({ day, name: name ?? "" }));
}

export async function deleteHoliday(day) {
  check(await supabase.from("holidays").delete().eq("day", day));
}
/** Admin: delete a screenshot — the image in the bucket and its record. */
export async function deleteSnapshot({ id, path }) {
  const removed = await supabase.storage.from("snapshots").remove([path]);
  if (removed.error) throw removed.error;
  const gone = check(await supabase.from("snapshots").delete().eq("id", id).select("id"));
  if (!gone.length) throw new Error("you don't have permission to delete screenshots");
}

const chunks = (list, size = 100) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** How many screenshots were taken during these clockings. */
export async function countSnapshotsForEntries(entryIds) {
  let total = 0;
  for (const ids of chunks(entryIds)) {
    const { count, error } = await supabase.from("snapshots").select("id", { count: "exact", head: true }).in("entry_id", ids);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

/**
 * Admin: deletes the screenshots (images and records) taken during these clockings.
 * Needed before deleting work: the database would otherwise only unlink them, leaving the images behind.
 */
export async function deleteSnapshotsForEntries(entryIds) {
  for (const ids of chunks(entryIds)) {
    const shots = check(await supabase.from("snapshots").select("id, storage_path").in("entry_id", ids));
    if (!shots.length) continue;
    const removed = await supabase.storage.from("snapshots").remove(shots.map((s) => s.storage_path));
    if (removed.error) throw removed.error;
    check(await supabase.from("snapshots").delete().in("id", shots.map((s) => s.id)));
  }
}

/* ---------- Team (admin) ---------- */

/** Admin: remove someone — deletes their sign-in, keeps their past time (profile marked removed). */
/**
 * Admin: delete someone's account for good — their sign-in, profile, logged time and screenshots.
 * Screenshot images are removed from the bucket first (the database can't delete stored files).
 */
/* ---------- Profile pictures (public "avatars" bucket, one folder per sign-in account) ---------- */

/** Uploads a profile picture and returns its public link. Older pictures in your folder are removed. */
export async function uploadAvatar(authUserId, blob) {
  const folder = authUserId;
  const path = `${folder}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  await removeAvatars(folder, path);
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

/** Removes the pictures in a person's folder (except `keep`). */
export async function removeAvatars(folder, keep = null) {
  if (!folder) return;
  const { data } = await supabase.storage.from("avatars").list(folder);
  const old = (data ?? []).map((f) => `${folder}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await supabase.storage.from("avatars").remove(old);
}

export async function deleteMemberAccount(memberId) {
  const shots = check(await supabase.from("snapshots").select("storage_path").eq("member_id", memberId));
  for (let i = 0; i < shots.length; i += 100) {
    const { error } = await supabase.storage.from("snapshots").remove(shots.slice(i, i + 100).map((s) => s.storage_path));
    if (error) throw error;
  }
  const { data: member } = await supabase.from("members").select("auth_user_id").eq("id", memberId).maybeSingle();
  await removeAvatars(member?.auth_user_id).catch(() => {}); // profile picture
  const { error } = await supabase.rpc("admin_delete_member", { p_member: memberId });
  if (error) throw error;
}

export async function removeMember(memberId) {
  const { error } = await supabase.rpc("admin_remove_member", { p_member: memberId });
  if (error) throw error;
}