import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { openItem } from "../../lib/router";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/time";
import { useStore } from "../../store/store";
import { markRead } from "../Notifications";
import { Avatar, Popover, cx } from "../ui";

/*
 * Header bell: your latest notifications, with a count of unread ones.
 * Opening it marks them read (they stay highlighted until it closes, so you can see which were new).
 */

const LIMIT = 30;

export default function NotificationBell() {
  const { me, memberById } = useStore();
  const [list, setList] = useState([]);
  const [fresh, setFresh] = useState(new Set()); // ids that were unread when the bell was opened
  const [ring, setRing] = useState(0); // goes up with each live notification: the bell shakes once
  const unread = list.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    supabase
      .from("notifications")
      .select("*")
      .eq("member_id", me.id)
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data }) => alive && data && setList(data));
    // New ones arrive live (its own channel; the pop-ups use another).
    const channel = supabase
      .channel(`bell-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `member_id=eq.${me.id}` }, ({ new: n }) => {
        setList((l) => [n, ...l.filter((x) => x.id !== n.id)].slice(0, LIMIT));
        setRing((r) => r + 1); // shake the bell
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [me?.id]);

  const onOpen = () => {
    const ids = list.filter((n) => !n.read_at).map((n) => n.id);
    setFresh(new Set(ids));
    if (!ids.length) return;
    markRead(ids);
    const at = new Date().toISOString();
    setList((l) => l.map((n) => (ids.includes(n.id) ? { ...n, read_at: at } : n)));
  };

  return (
    <Popover
      align="right"
      className="w-[22rem] max-w-[calc(100vw-1.5rem)] !p-0 overflow-hidden"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={() => {
            if (!open) onOpen();
            toggle();
          }}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          aria-expanded={open}
          className={cx(
            "relative grid size-10 shrink-0 place-items-center rounded-xl transition",
            open ? "bg-brand-50 text-brand-600 ring-2 ring-brand-300" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800",
          )}
        >
          {/* Keyed by `ring`: each new notification remounts it, so it shakes once */}
          <Bell key={ring} className={cx("size-[19px] origin-top", ring > 0 && "animate-wiggle")} />
          {unread > 0 && (
            <span
              key={unread} // pops whenever the count changes
              className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] animate-badge-pop place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-extrabold text-white ring-2 ring-surface"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="text-sm font-extrabold text-stone-900">Notifications</p>
            {fresh.size > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{fresh.size} new</span>}
          </div>
          {!list.length ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-stone-400">
              <BellOff className="size-6" />
              Nothing yet. You'll see subtasks assigned to you, and your subtasks others complete, here.
            </div>
          ) : (
            <ul className="stagger max-h-[60vh] divide-y divide-stone-100 overflow-y-auto scrollbar-thin">
              {list.map((n) => {
                const isNew = fresh.has(n.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        if (n.item_id) openItem(n.item_id);
                      }}
                      className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-stone-50", isNew && "bg-brand-50/60")}
                    >
                      <Avatar member={memberById.get(n.actor_id)} size="sm" className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-sm leading-snug", isNew ? "font-bold text-stone-900" : "font-medium text-stone-700")}>{n.title}</span>
                        {n.body && <span className="mt-0.5 block truncate text-xs text-stone-400">{n.body}</span>}
                        <span className="mt-1 block text-[11px] font-semibold text-stone-400">{timeAgo(Date.parse(n.created_at))}</span>
                      </span>
                      {isNew && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-label="New" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Popover>
  );
}
