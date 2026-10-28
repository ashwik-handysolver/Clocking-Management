import { createClient } from "@supabase/supabase-js";

/*
 * The one Supabase client for the app.
 * Values come from .env.local (never committed):
 *   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   (or the legacy "anon" key)
 * Both are safe in the browser; access is controlled by Row Level Security in the database.
 * Never put the service_role / secret key here.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

/**
 * Opened from a "reset password" email? Read before the client below consumes the link
 * (it removes the tokens from the address), since its PASSWORD_RECOVERY event can fire
 * before the app is listening.
 */
export const openedFromRecoveryLink = /type=recovery/.test(window.location.hash + window.location.search);

export const supabase = supabaseConfigured ? createClient(url, key) : null;

/** Quick check that the URL and key work: asks the auth server for its settings. */
export async function checkSupabaseConnection() {
  if (!supabaseConfigured) return { ok: false, reason: "VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local" };
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    return res.ok ? { ok: true } : { ok: false, reason: `Supabase answered ${res.status}. Check the key.` };
  } catch {
    return { ok: false, reason: "Couldn't reach Supabase. Check the URL." };
  }
}
