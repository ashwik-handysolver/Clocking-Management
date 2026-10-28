import { useEffect, useRef } from "react";
import { openItem } from "../lib/router";
import { supabase } from "../lib/supabase";
import { useStore } from "../store/store";
import { useDialogs } from "./dialogs";

/*
 * Assignment notifications. The database creates one whenever someone is added to a subtask
 * (notify_assignees trigger). Here we:
 *  - at sign-in, show the ones that arrived while you were away (then mark them read);
 *  - while signed in, show new ones instantly (Supabase Realtime);
 *  - when this tab is in the background and you've allowed it, also show a desktop notification.
 * Renders nothing.
 */

const CATCH_UP_SHOWN = 3; // older unread ones are summarised in one toast

const markRead = (ids) => ids.length && supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).then(() => {});

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

function showDesktop(n) {
  if (!desktopNotificationsOn() || document.visibilityState === "visible") return;
  try {
    const note = new Notification(n.title, { body: n.body || "Open HandySolver to start working on it", tag: `n-${n.id}` });
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

    // 1. What arrived while you were signed out.
    supabase
      .from("notifications")
      .select("*")
      .eq("member_id", me.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!alive || !data?.length) return;
        data.slice(0, CATCH_UP_SHOWN).reverse().forEach(show);
        if (data.length > CATCH_UP_SHOWN) toast(`…and ${data.length - CATCH_UP_SHOWN} more subtasks were assigned to you while you were away`, "notify", { detail: "See them in My work" });
        markRead(data.map((n) => n.id));
      });

    // 2. New ones, live.
    const channel = supabase
      .channel(`notifications-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `member_id=eq.${me.id}` }, ({ new: n }) => {
        show(n);
        markRead([n.id]);
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [me?.id, toast]);

  return null;
}
