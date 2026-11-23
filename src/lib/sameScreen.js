import { supabase } from "./supabase";

/*
 * "Same screen" alert: while you're clocked in, if every screenshot for 10 minutes or more shows the
 * same screen, you get a toast and a desktop notification, and the admin sees it counted.
 *
 * Screens are compared as small greyscale fingerprints (64×36 pixels). The bottom strip (taskbar
 * clock) is ignored, and a few changed pixels (a blinking cursor) still count as the same screen.
 * Each alert is saved in the activity log (kind "same_screen"), so it also shows in Team activity.
 */

export const SAME_SCREEN_MS = 10 * 60_000;
const W = 64;
const H = 36;
const IGNORE_BOTTOM = 0.08; // taskbar / dock with its clock
const PIXEL_DIFF = 10; // 0–255: smaller changes are noise
const CHANGED_SHARE = 0.005; // under 0.5% of pixels changed = same screen

/** A small greyscale fingerprint of a screenshot, or null if it can't be read. */
export async function fingerprint(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height * (1 - IGNORE_BOTTOM), 0, 0, W, H);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, W, H);
    const out = new Uint8Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
    return out;
  } catch {
    return null;
  }
}

/** True when two fingerprints show (practically) the same screen. */
export function sameScreen(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > PIXEL_DIFF) changed++;
  return changed / a.length < CHANGED_SHARE;
}

/* The on/off switch (Account page), remembered in this browser. On by default. */
const PREF_KEY = "clockwork-same-screen-alerts";
export function sameScreenAlertsOn() {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSameScreenAlerts(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* not remembered; still applies this visit */
  }
}

/** Saves one alert in the activity log (shows in Team activity and in the admin's counts). */
export async function logSameScreen({ id, memberId, subtaskId, minutes }) {
  const { error } = await supabase.from("activity").insert({
    id,
    item_id: subtaskId,
    member_id: memberId,
    at: new Date().toISOString(),
    kind: "same_screen",
    text: `same screen for ${minutes} min`,
  });
  if (error) throw error;
}

/** How many alerts each person had since `sinceMs`: Map(memberId → count). Admin only (sees everyone's activity). */
export async function loadSameScreenCounts(sinceMs) {
  const { data, error } = await supabase.from("activity").select("member_id").eq("kind", "same_screen").gte("at", new Date(sinceMs).toISOString());
  if (error) throw error;
  const counts = new Map();
  for (const r of data ?? []) counts.set(r.member_id, (counts.get(r.member_id) ?? 0) + 1);
  return counts;
}
