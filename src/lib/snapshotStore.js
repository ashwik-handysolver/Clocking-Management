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

export async function saveSnapshot({ id, entryId, memberId, memberName, takenAt, blob }) {
  const { data } = await supabase.auth.getUser();
  const authId = data.user?.id;
  if (!authId) throw new Error("Not signed in");
  const d = new Date(takenAt);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const path = `${slug(memberName)}-${authId.slice(0, 8)}/${day}/${time}.jpg`;

  const upload = await supabase.storage.from("snapshots").upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (upload.error) throw upload.error;

  const record = { id, member_id: memberId, entry_id: entryId, taken_at: d.toISOString(), storage_path: path };
  // The first screenshot is taken right at clock-in, possibly before the new time entry has been saved,
  // so wait and retry if the entry isn't in the database yet (foreign key error 23503).
  for (let attempt = 0; ; attempt++) {
    const { error } = await supabase.from("snapshots").insert(record);
    if (!error) return;
    if (error.code !== "23503" || attempt >= 4) throw error;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
}
