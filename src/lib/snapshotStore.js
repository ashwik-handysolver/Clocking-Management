import { supabase } from "./supabase";

/*
 * Screenshots taken while clocked in go to the private "snapshots" bucket in Supabase Storage,
 * with a row in the snapshots table pointing to the file. Files are laid out so they're easy to
 * browse in the Supabase dashboard:
 *
 *   <name>-<first 8 chars of account id>/<YYYY-MM-DD>/<HH-MM-SS>.jpg
 *   e.g. ashwik-a1f77c89/2026-10-28/14-05-32.jpg
 *
 * The account-id part is what the bucket's upload rule checks, so people can only upload into
 * their own folder. Dates and times are the person's local time.
 * Team members can't view screenshots; the admin sees them on the Screenshots page.
 */

const pad = (n) => String(n).padStart(2, "0");
const slug = (s) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "member";

/*
 * Offline: a screenshot that can't be uploaded waits here (in memory, up to MAX_WAITING) and is
 * uploaded when the connection is back. Kept in this tab only, so closing the tab drops them.
 */
const MAX_WAITING = 40; // ~40 × 300 KB at most
const waiting = [];
let flushing = false;

/** Saves a screenshot now, or keeps it to upload later if the connection is down. */
export async function saveOrQueueSnapshot(shot) {
  try {
    await saveSnapshot(shot);
    flushSnapshots(); // connection works: send anything still waiting
  } catch (err) {
    if (waiting.length >= MAX_WAITING) waiting.shift(); // keep the newest
    waiting.push(shot);
    throw err;
  }
}

/** Uploads waiting screenshots, oldest first; stops at the first failure and tries again later. */
export async function flushSnapshots() {
  if (flushing || !waiting.length) return;
  flushing = true;
  try {
    while (waiting.length) {
      await saveSnapshot(waiting[0]);
      waiting.shift();
    }
  } catch {
    /* still offline: try again on the next screenshot or when the connection returns */
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") window.addEventListener("online", () => flushSnapshots());

export async function saveSnapshot({ id, entryId, memberId, memberName, takenAt, blob }) {
  // From the saved session (no network call), so it also works right after reconnecting.
  const { data } = await supabase.auth.getSession();
  const authId = data.session?.user?.id;
  if (!authId) throw new Error("Not signed in");
  const d = new Date(takenAt);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const path = `${slug(memberName)}-${authId.slice(0, 8)}/${day}/${time}.jpg`;

  const upload = await supabase.storage.from("snapshots").upload(path, blob, { contentType: blob.type || "image/jpeg" });
  // "Already exists": an earlier try uploaded the image but lost the connection before saving its record.
  const exists = upload.error && (String(upload.error.statusCode) === "409" || /exists/i.test(upload.error.message ?? ""));
  if (upload.error && !exists) throw upload.error;

  const record = { id, member_id: memberId, entry_id: entryId, taken_at: d.toISOString(), storage_path: path };
  // The first screenshot is taken right at clock-in, possibly before the new time entry has been saved,
  // so wait and retry if the entry isn't in the database yet (foreign key error 23503).
  for (let attempt = 0; ; attempt++) {
    const { error } = await supabase.from("snapshots").insert(record);
    if (!error || error.code === "23505") return; // 23505: record already saved by an earlier try
    if (error.code !== "23503" || attempt >= 4) throw error;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
}
