import { useEffect, useRef } from "react";
import { openItem } from "../lib/router";
import { supabase } from "../lib/supabase";
import { useStore } from "../store/store";
import { useDialogs } from "./dialogs";

/*
 * Notifications. The database creates them: when someone is added to a subtask (notify_assignees),
 * and when someone else marks a subtask you created Completed (notify_completed). Here we:
 *  - at sign-in, show the ones that arrived while you were away (then mark them shown);
 *  - while signed in, show new ones instantly (Supabase Realtime), with a 30-second safety check;
 *  - when you're not looking at the app and you've allowed it, also show a desktop notification.
 * Renders nothing.
 */

const CATCH_UP_SHOWN = 3; // older unread ones are summarised in one toast

// shown_at: its pop-up was shown (so it isn't shown again at next sign-in). read_at is set by the header bell.
const markShown = (ids) => ids.length && supabase.from("notifications").update({ shown_at: new Date().toISOString() }).in("id", ids).then(() => {});
export const markRead = (ids) =>
  ids.length && supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).is("read_at", null).then(() => {});

/** Desktop notifications: supported, and what the browser says ("default" = not asked yet). */
export function desktopPermission() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/*
 * The on/off switch is remembered in this browser. The browser's own permission is asked for the
 * first time it's switched on; switching off just stops showing them (a site can't revoke its own
 * permission, so "off" is our setting, not the browser's).
 */
const PREF_KEY = "handysolver-desktop-notifications";
export function desktopNotificationsOn() {
  try {
    return localStorage.getItem(PREF_KEY) === "on" && desktopPermission() === "granted";
  } catch {
    return false;
  }
}

/**
 * Switch desktop notifications on or off (call from a click: turning on may show the browser's prompt).
 * Returns the resulting state: "on" | "off" | "blocked" (denied in browser settings) | "unsupported".
 */
export async function setDesktopNotifications(on) {
  const save = (v) => {
    try {
      localStorage.setItem(PREF_KEY, v);
    } catch {
      /* not remembered, still works this visit */
    }
  };
  if (!on) {
    save("off");
    return "off";
  }
  if (typeof Notification === "undefined") return "unsupported";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return "blocked";
  save("on");
  return "on";
}

/** Shows a sample desktop notification after `delayMs`, so you can switch to another tab first. */
export function sendTestNotification(delayMs = 5000) {
  setTimeout(() => {
    try {
      const note = new Notification("Test: new subtask assigned to you", { body: "Desktop notifications are working.", tag: "n-test" });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    } catch {
      /* not supported here */
    }
  }, delayMs);
}

/** You're looking at the app right now: its tab is showing and its window has focus. */
const lookingAtApp = () => document.visibilityState === "visible" && document.hasFocus();

function showDesktop(n) {
  // Another tab, another app, or a minimised window: notify on the desktop.
  if (!desktopNotificationsOn() || lookingAtApp()) return;
  try {
    const note = new Notification(n.title, { body: n.body || "Open Clockwork to see it", tag: `n-${n.id}` });
    note.onclick = () => {
      window.focus();
      if (n.item_id) openItem(n.item_id);
      note.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker; the toast still shows */
  }
}

export default function Notifications() {
  const { me } = useStore();
  const { toast } = useDialogs();
  const seen = useRef(new Set());

  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    const show = (n) => {
      if (seen.current.has(n.id)) return;
      seen.current.add(n.id);
      toast(n.title, "notify", {
        detail: n.body,
        action: n.item_id ? { label: "Open", onClick: () => openItem(n.item_id) } : undefined,
      });
      showDesktop(n);
    };

    // Anything not shown yet: at sign-in, and as a safety net if the live connection missed something.
    let checking = false;
    const catchUp = async (firstTime = false) => {
      if (checking) return;
      checking = true;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("member_id", me.id)
        .is("shown_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      checking = false;
      const missed = (data ?? []).filter((n) => !seen.current.has(n.id));
      if (!alive || !missed.length) return;
      const shown = firstTime ? missed.slice(0, CATCH_UP_SHOWN) : missed;
      shown.reverse().forEach(show);
      if (firstTime && missed.length > CATCH_UP_SHOWN)
        toast(`…and ${missed.length - CATCH_UP_SHOWN} more notifications while you were away`, "notify", { detail: "See them all under the bell" });
      missed.forEach((n) => seen.current.add(n.id));
      markShown(missed.map((n) => n.id));
    };
    catchUp(true);

    // New ones, live. After a dropped connection comes back, check for anything missed meanwhile.
    let connectedOnce = false;
    const channel = supabase
      .channel(`notifications-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `member_id=eq.${me.id}` }, ({ new: n }) => {
        show(n);
        markShown([n.id]);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (connectedOnce) catchUp();
        connectedOnce = true;
      });

    // Safety net: every 30 seconds (Chrome may slow this to once a minute in a background tab),
    // and whenever you come back to the tab or the network returns.
    const poll = setInterval(() => catchUp(), 30_000);
    const onBack = () => catchUp();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);

    return () => {
      alive = false;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
      supabase.removeChannel(channel);
    };
  }, [me?.id, toast]);

  return null;
}
