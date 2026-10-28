import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Archive, CalendarRange, Camera, CircleUserRound, FileBarChart, ChevronsUpDown, FolderKanban, LayoutDashboard, ListTodo, LogOut, Pin, PinOff, Users, X,
} from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { ADMIN_PAGES, openItem, useRoute } from "../../lib/router";
import { isAdmin } from "../../store/permissions";
import { formatClock } from "../../lib/time";
import { entrySeconds } from "../../store/model";
import { supabase } from "../../lib/supabase";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Avatar, Popover, cx } from "../ui";

// Items without a `page` aren't built yet.
const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", page: "dashboard" },
  { icon: ListTodo, label: "My work", page: "my" },
  { icon: FolderKanban, label: "Clients & Projects", page: "work" },
  { icon: Camera, label: "Screenshots", page: "screenshots" },
  { icon: CircleUserRound, label: "My account", page: "account" },
];

// Shown only to the admin, under their own heading.
const ADMIN_NAV = [
  { icon: Users, label: "Team", page: "team" },
  { icon: CalendarRange, label: "Timesheets", page: "timesheets" },
  { icon: FileBarChart, label: "Reports", page: "reports" },
  { icon: Archive, label: "Archive", page: "archive" },
];

/*
 * Layout note: the collapsed sidebar is 84px wide with 12px padding, leaving a 60px column.
 * Every icon/avatar keeps the same left offset in both states (centred in that column),
 * so expanding only widens the panel and fades the labels in — nothing jumps.
 */

/** Fades labels out on desktop when the sidebar is narrow. */
const fade = (expanded) =>
  cx("transition-opacity ease-smooth", expanded ? "opacity-100 delay-150 duration-300" : "duration-150 lg:pointer-events-none lg:opacity-0");

export function Logo({ compact, dark, labelClass }) {
  return (
    <div className="flex items-center gap-3">
      {/* The HandySolver "hs" mark (same file as the favicon) */}
      <img src="/favicon.svg" alt="HandySolver" className={cx("size-10 shrink-0 rounded-[8px] shadow-soft", dark && "ring-1 ring-white/15")} />
      {!compact && (
        <span className={cx("leading-tight whitespace-nowrap", labelClass)}>
          <span className={cx("block text-[17px] font-extrabold tracking-tight", dark ? "text-white" : "text-stone-900")}>
            Clock<span className="text-brand-500">work</span>
          </span>
          <span className={cx("block text-[11px] font-semibold", dark ? "text-white/50" : "text-stone-400")}>by HandySolver</span>
        </span>
      )}
    </div>
  );
}

/** Your own running timer (others' time is private) — ticks every second. */
function OnTheClock({ expanded }) {
  const { entries, index, memberById } = useStore();
  const live = entries.filter((e) => e.end == null);
  const now = useNow(live.length > 0);

  return (
    <div className="mt-6">
      <p className={cx("mb-2 flex items-center gap-2 px-4 text-[11px] font-bold tracking-widest whitespace-nowrap text-stone-500 uppercase", fade(expanded))}>
        Your timer
      </p>
      {live.length === 0 && <p className={cx("px-4 text-xs whitespace-nowrap text-stone-500", fade(expanded))}>Not clocked in.</p>}
      <ul className="space-y-1">
        {live.map((e) => {
          const m = memberById.get(e.memberId);
          const sub = index.get(e.subtaskId);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => openItem(e.subtaskId)}
                title={`${m?.name} — ${sub?.name}`}
                className="flex w-full items-center gap-3 overflow-hidden rounded-2xl py-2 pr-2 pl-4 text-left transition-colors hover:bg-white/5"
              >
                <span className="relative shrink-0">
                  <Avatar member={m} size="sm" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 animate-pulse-dot rounded-full bg-emerald-400 ring-2 ring-stone-950" />
                </span>
                <span className={cx("min-w-0 flex-1", fade(expanded))}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-stone-200">{m?.name.split(" ")[0]}</span>
                    <span className="font-mono text-[11px] text-emerald-400 tabular-nums">{formatClock(entrySeconds(e, now))}</span>
                  </span>
                  <span className="block truncate text-[11px] text-stone-500">{sub?.name}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One sidebar link. Items without a `page` show "Soon". */
function NavLink({ icon: Icon, label, page, active, showLabels, onClick }) {
  return (
    <a
      href={page ? `#/${page}` : undefined}
      title={label}
      aria-current={active ? "page" : undefined}
      aria-disabled={!page || undefined}
      onClick={onClick}
      className={cx(
        "flex h-11 items-center gap-3 overflow-hidden rounded-2xl pr-3 pl-5 text-sm font-semibold whitespace-nowrap transition-colors duration-300",
        active
          ? "bg-brand-500 text-white shadow-glow"
          : page
            ? "text-stone-300 hover:bg-white/10 hover:text-white"
            : "cursor-default text-stone-500 hover:bg-white/[0.03]",
      )}
    >
      <Icon className="size-[19px] shrink-0" />
      <span className={cx("flex flex-1 items-center justify-between gap-2", fade(showLabels))}>
        {label}
        {!page && <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">Soon</span>}
      </span>
    </a>
  );
}

/**
 * Floating sidebar. On desktop it is either pinned open or collapsed to icons,
 * and a collapsed sidebar opens while hovered. The page reads `expanded` to make room.
 */
export default function Sidebar({ pinnedOpen, onTogglePinned, mobileOpen, onCloseMobile }) {
  // Hover state lives here (not in App) so hovering only re-renders the sidebar.
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef();
  const setHover = (value, delay) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(value), delay);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const expanded = pinnedOpen || hovered;
  const route = useRoute();
  const { me, actions } = useStore();
  const currentPage = ["work", "dashboard", "account", ...ADMIN_PAGES].includes(route.page) ? route.page : "my";

  // The page reads this attribute in CSS (.app-content) to make room — same frame as our width change.
  useLayoutEffect(() => {
    document.documentElement.dataset.sidebar = expanded ? "expanded" : "collapsed";
  }, [expanded]);

  // On phones the drawer is always full width with labels visible.
  const showLabels = expanded || mobileOpen;

  return (
    <>
      <div
        onClick={onCloseMobile}
        className={cx(
          "palette-fixed fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        onMouseEnter={() => setHover(true, 60)}
        onMouseLeave={() => setHover(false, 160)}
        className={cx(
          "palette-fixed fixed inset-y-3 left-3 z-50 flex w-72 flex-col overflow-hidden rounded-[28px] bg-stone-950 p-3 text-stone-300 shadow-float",
          "bg-[radial-gradient(120%_60%_at_0%_0%,rgb(255_107_26/0.18),transparent_60%)]",
          "transition-[width,transform] duration-[450ms] ease-smooth [contain:layout_paint]",
          expanded ? "lg:w-64" : "lg:w-[84px]",
          mobileOpen ? "translate-x-0" : "-translate-x-[calc(100%+1.5rem)] lg:translate-x-0",
        )}
      >
        <div className="flex h-12 items-center justify-between pl-2.5">
          <Logo dark labelClass={fade(showLabels)} />
          <button type="button" onClick={onCloseMobile} aria-label="Close menu" className="grid size-9 place-items-center rounded-xl text-stone-400 hover:bg-white/10 lg:hidden">
            <X className="size-5" />
          </button>
        </div>

        <nav className="mt-6 flex flex-col gap-1">
          <p className={cx("mb-1 px-4 text-[11px] font-bold tracking-widest whitespace-nowrap text-stone-500 uppercase", fade(showLabels))}>Workspace</p>
          {NAV.map((item) => (
            <NavLink key={item.label} {...item} active={item.page === currentPage} showLabels={showLabels} onClick={onCloseMobile} />
          ))}
          {isAdmin(me) && (
            <>
              <p className={cx("mt-4 mb-1 px-4 text-[11px] font-bold tracking-widest whitespace-nowrap text-stone-500 uppercase", fade(showLabels))}>Admin</p>
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.label} {...item} active={item.page === currentPage} showLabels={showLabels} onClick={onCloseMobile} />
              ))}
            </>
          )}
        </nav>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
          <OnTheClock expanded={showLabels} />
        </div>

        <div className="space-y-2 pt-3">
          <button
            type="button"
            onClick={() => {
              onTogglePinned();
              clearTimeout(hoverTimer.current);
              setHovered(false);
            }}
            title={pinnedOpen ? "Collapse sidebar (opens on hover)" : "Keep sidebar open"}
            className="hidden h-9 w-full items-center gap-3 overflow-hidden rounded-xl pl-[22px] text-xs font-semibold whitespace-nowrap text-stone-500 transition-colors hover:bg-white/5 hover:text-stone-300 lg:flex"
          >
            {pinnedOpen ? <PinOff className="size-4 shrink-0" /> : <Pin className="size-4 shrink-0" />}
            <span className={fade(showLabels)}>{pinnedOpen ? "Unpin sidebar" : "Keep sidebar open"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
