import { useEffect, useState } from "react";
import { Bell, BellRing, ChevronDown, ChevronRight, LogOut, Menu, Moon, Pencil, Plus, Search, Square, Sun, Timer } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { useTheme } from "../../hooks/useTheme";
import { navigate, openItem } from "../../lib/router";
import { formatClock } from "../../lib/time";
import { TYPE_LABEL, ancestry, entrySeconds, runningEntryOf } from "../../store/model";
import { canCreate } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useClock } from "../clock";
import { useDialogs } from "../dialogs";
import { Avatar, Button, Popover, cx } from "../ui";
import CommandPalette from "./CommandPalette";
import AddSubtaskWizard from "../AddSubtaskWizard";
import NotificationBell from "./NotificationBell";
import { desktopNotificationsOn, desktopPermission, sendTestNotification, setDesktopNotifications } from "../Notifications";
import { Logo } from "./Sidebar";

const PAGE_TITLE = { my: "My work", dashboard: "Dashboard", account: "My account", team: "Team", timesheets: "Timesheets", reports: "Reports", screenshots: "Screenshots", archive: "Archive" };

/** HH:MM:SS where each digit rolls up when it changes. */
function RollingClock({ seconds }) {
  const text = formatClock(seconds);
  return (
    <span className="flex shrink-0 font-mono text-[15px] leading-none font-bold tabular-nums" aria-label={text}>
      {[...text].map((ch, i) =>
        ch === ":" ? (
          <span key={i} className="px-px text-white/70">
            :
          </span>
        ) : (
          <span key={i} className="inline-block h-[1.1em] w-[1ch] overflow-hidden text-center" aria-hidden="true">
            {/* Keyed by value: a new digit remounts and plays the roll-in. */}
            <span key={ch} className="inline-block animate-digit motion-reduce:animate-none">
              {ch}
            </span>
          </span>
        ),
      )}
    </span>
  );
}

/** Timer icon with a soft radar ping and a ring that fills once a minute. */
function ClockBadge({ startSeconds }) {
  // Start the minute ring where the timer actually is (negative delay), once per entry.
  const [delay] = useState(() => `-${Math.floor(startSeconds % 60)}s`);
  return (
    <span className="relative hidden size-9 shrink-0 place-items-center sm:grid">
      <span className="absolute inset-0 animate-ping-soft rounded-full bg-white/40 motion-reduce:animate-none" />
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="15.5" pathLength="100" className="fill-white/15 stroke-white/25" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          pathLength="100"
          strokeDasharray="100"
          strokeLinecap="round"
          strokeWidth="3"
          className="animate-minute fill-none stroke-white motion-reduce:animate-none"
          style={{ animationDelay: delay }}
        />
      </svg>
      <Timer className="relative size-4" strokeWidth={2.5} />
    </span>
  );
}

/** The current user's clock-in state. Big, orange and animated while a timer runs. */
function TimerPill() {
  const { state, index, me } = useStore();
  const { clockOut, busyElsewhere } = useClock();
  const { toast } = useDialogs();
  const running = runningEntryOf(state.entries, me.id);
  const now = useNow(Boolean(running));

  if (!running) return null;

  const sub = index.get(running.subtaskId);
  const elapsed = entrySeconds(running, now);
  return (
    <div
      key={running.id}
      role="status"
      aria-label={`Clocked in on ${sub?.name}`}
      className="flex min-w-0 animate-clock-in items-center gap-1 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 p-1 text-white shadow-glow ring-4 ring-brand-500/15 motion-reduce:animate-none"
    >
      <button
        type="button"
        onClick={() => openItem(running.subtaskId)}
        title={`Open “${sub?.name}”`}
        className="flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-2 pl-2.5 transition-colors hover:bg-white/10 sm:gap-2.5 sm:pr-2.5 sm:pl-0.5"
      >
        {/* Phones: a pulsing dot instead of the full badge, to fit the header. */}
        <span className="relative size-2.5 shrink-0 sm:hidden">
          <span className="absolute inset-0 animate-ping-soft rounded-full bg-surface motion-reduce:animate-none" />
          <span className="absolute inset-0 rounded-full bg-surface" />
        </span>
        <ClockBadge key={running.id} startSeconds={elapsed} />
        <span className="hidden min-w-0 text-left leading-tight lg:block">
          <span className="block text-[10px] font-extrabold tracking-widest text-white/75 uppercase">Clocked in</span>
          <span className="block max-w-36 truncate text-xs font-semibold">{sub?.name}</span>
        </span>
        <RollingClock seconds={elapsed} />
      </button>
      <button
        type="button"
        aria-label="Stop timer"
        title={busyElsewhere ? "Stop it from the tab where you clocked in" : "Stop timer"}
        disabled={busyElsewhere}
        onClick={() => clockOut() && toast("Timer stopped and time logged")}
        className="grid size-8 place-items-center rounded-full bg-surface text-brand-600 shadow-sm transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:size-9"
      >
        <Square className="size-3.5" fill="currentColor" />
      </button>
    </div>
  );
}

/** Thin orange shimmer along the bottom of the header while clocked in. */
function ClockingAccent() {
  const { state, me } = useStore();
  if (!runningEntryOf(state.entries, me.id)) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-8 -bottom-px h-[3px] animate-fade-in overflow-hidden rounded-full bg-brand-500/15">
      <span className="block h-full w-1/4 animate-sweep rounded-full bg-gradient-to-r from-transparent via-brand-500 to-transparent motion-reduce:animate-none" />
    </span>
  );
}

function Crumbs({ selectedId, page }) {
  const { index } = useStore();
  const chain = selectedId ? ancestry(index, selectedId) : [];
  const current = chain.at(-1);
  return (
    <div className="min-w-0">
      <nav className="hidden min-w-0 items-center gap-1 overflow-hidden text-xs font-medium whitespace-nowrap text-stone-400 sm:flex">
        <button type="button" onClick={() => navigate(page)} className="shrink-0 hover:text-stone-700">
          {page === "work" ? "Clients & Projects" : "Workspace"}
        </button>
        {chain.slice(0, -1).map((a) => (
          <span key={a.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="size-3 shrink-0" />
            <button type="button" onClick={() => openItem(a.id)} className="max-w-32 truncate hover:text-stone-700">
              {a.name}
            </button>
          </span>
        ))}
      </nav>
      <p className="truncate text-base font-extrabold tracking-tight text-stone-900">
        {current ? current.name : page === "work" ? "Overview" : PAGE_TITLE[page] ?? "Overview"}
        {current && <span className="ml-2 align-middle text-[11px] font-bold text-brand-600 uppercase">{TYPE_LABEL[current.type]}</span>}
      </p>
    </div>
  );
}

export default function Topbar({ newType, selectedId, page, onOpenMenu }) {
  const { state, me } = useStore();
  const { openItemForm, toast } = useDialogs();
  const [searchOpen, setSearchOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const clocking = Boolean(runningEntryOf(state.entries, me.id));
  // Clients and projects are admin-only; on a client page others add a task instead.
  const type = canCreate(me, newType) ? newType : selectedId ? "task" : null;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header
        className={cx(
          "sticky top-3 z-30 flex h-[68px] items-center gap-2 rounded-[22px] bg-surface/95 px-3 shadow-float ring-1 transition-[box-shadow] duration-500 sm:gap-3 sm:px-4",
          clocking ? "ring-brand-200" : "ring-surface",
        )}
      >
        <ClockingAccent />
        <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="grid size-10 shrink-0 place-items-center rounded-xl text-stone-600 hover:bg-stone-100 lg:hidden">
          <Menu className="size-5" />
        </button>
        <span className="sm:hidden">
          <Logo compact />
        </span>
        <div className="hidden min-w-0 flex-1 sm:block">
          <Crumbs selectedId={selectedId} page={page} />
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="flex h-10 items-center gap-2 rounded-xl bg-stone-100/80 px-3 text-sm text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 xl:w-64"
          >
            <Search className="size-4" />
            <span className="hidden flex-1 text-left xl:block">Search work…</span>
            <kbd className="hidden rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-bold text-stone-500 shadow-sm xl:block">Ctrl K</kbd>
          </button>
          {/* <ThemeToggle /> */}
          <TimerPill />
          {/* Team members: pick client → project → task, then fill in the subtask. */}
          {!me.isAdmin && (
            <Button variant="primary" icon={Plus} aria-label="Add subtask" onClick={() => setWizardOpen(true)} className="max-sm:aspect-square max-sm:px-0">
              <span className="hidden sm:inline">Add subtask</span>
            </Button>
          )}
          {type && (
            <Button variant={me.isAdmin ? "primary" : "secondary"} icon={Plus} aria-label="New" onClick={() => openItemForm({ type, contextId: selectedId })} className={cx("max-sm:aspect-square max-sm:px-0")}>
              <span className="hidden sm:inline">New</span>
            </Button>
          )}
          <NotificationBell />
          <ProfileMenu />
        </div>
      </header>
      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      {/* Starts from the page you're on: on a task or subtask page, straight at the subtask form */}
      {wizardOpen && <AddSubtaskWizard contextId={selectedId} onClose={() => setWizardOpen(false)} toast={toast} />}
    </>
  );
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid size-10 shrink-0 place-items-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

/** Your avatar (with name on wide screens) in the header; opens a profile card with Sign out. */
function ProfileMenu() {
  const { me, actions, state } = useStore();
  const { dark, toggle: toggleTheme } = useTheme();
  // "on" | "off" | "blocked" | "unsupported"
  const [notify, setNotify] = useState(() =>
    desktopPermission() === "unsupported" ? "unsupported" : desktopNotificationsOn() ? "on" : "off",
  );
  const [testSent, setTestSent] = useState(false);
  const clocking = Boolean(runningEntryOf(state.entries, me.id));
  const role =me.isAdmin ? "Admin" : me.role || "Team member";
  return (
    <Popover
      align="right"
      className="w-72 !p-0 overflow-hidden"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Profile menu"
          aria-expanded={open}
          className={cx(
            "flex h-11 shrink-0 items-center gap-2 rounded-full p-0.5 transition xl:pr-3",
            open ? "bg-brand-50 ring-2 ring-brand-300" : "hover:bg-stone-100 hover:ring-1 hover:ring-stone-200",
          )}
        >
          <span className="relative">
            <Avatar member={me} ring />
            <span className={cx("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface", clocking ? "bg-emerald-500" : "bg-stone-300")} />
          </span>
          <span className="hidden min-w-0 text-left leading-tight xl:block">
            <span className="block max-w-32 truncate text-sm font-bold text-stone-800">{me.name.split(" ")[0]}</span>
            <span className="block max-w-32 truncate text-[11px] font-semibold text-stone-400">{role}</span>
          </span>
          <ChevronDown className={cx("hidden size-4 text-stone-400 transition-transform xl:block", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          {/* Banner: picture, name, email, role and clock status — nothing overlaps */}
          <div className="relative overflow-hidden border-b border-brand-100 bg-gradient-to-br from-brand-100 via-brand-50 to-surface p-4">
            <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-[radial-gradient(closest-side,rgb(249_115_22/0.25),transparent)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(120_53_15/0.07)_1px,transparent_1px)] [background-size:14px_14px]" />
            <div className="relative flex items-center gap-3">
              <Avatar member={me} size="lg" className="shadow-soft ring-2 ring-surface" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-stone-900">
                  <span className="truncate">{me.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      navigate("account");
                    }}
                    aria-label="Edit your profile"
                    title="Edit your profile"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-surface/80 text-stone-500 ring-1 ring-stone-200 transition hover:bg-brand-500 hover:text-white hover:ring-brand-500"
                  >
                    <Pencil className="size-3" />
                  </button>
                </p>
                <p className="truncate text-xs text-stone-500">{me.email}</p>
              </div>
            </div>
            <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{role}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-bold text-stone-700 ring-1 ring-stone-200">
                <span className={cx("size-2 rounded-full", clocking ? "animate-pulse-dot bg-emerald-500" : "bg-stone-300")} />
                {clocking ? "Clocked in" : "Not clocked in"}
              </span>
            </div>
          </div>
          {/* Actions */}
          <div className="space-y-0.5 p-2">
            {notify !== "unsupported" && (
              <div className="rounded-xl px-2.5 py-2 hover:bg-stone-50">
                <button
                  type="button"
                  role="switch"
                  aria-checked={notify === "on"}
                  onClick={async () => setNotify(await setDesktopNotifications(notify !== "on"))}
                  className="flex w-full items-center gap-2.5 text-left text-sm font-semibold text-stone-700"
                >
                  {notify === "on" ? <BellRing className="size-4 text-brand-500" /> : <Bell className="size-4 text-stone-400" />}
                  <span className="flex-1">Push notifications</span>
                  {/* switch */}
                  <span className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", notify === "on" ? "bg-brand-500" : "bg-stone-300")}>
                    <span className={cx("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform", notify === "on" && "translate-x-4")} />
                  </span>
                </button>
                {notify === "on" && (
                  <button
                    type="button"
                    onClick={() => {
                      sendTestNotification();
                      setTestSent(true);
                      setTimeout(() => setTestSent(false), 6000);
                    }}
                    className="mt-1 pl-[26px] text-left text-[11px] font-semibold text-brand-600 hover:underline"
                  >
                    {testSent ? "Sending in 5 seconds… switch to another tab" : "Send a test notification"}
                  </button>
                )}
                {notify === "blocked" && (
                  <p className="mt-1 pl-[26px] text-[11px] leading-snug text-red-600">Blocked by your browser. Allow notifications for this site (padlock icon in the address bar), then switch on again.</p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              {dark ? <Sun className="size-4 text-stone-400" /> : <Moon className="size-4 text-stone-400" />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                actions.signOut();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <LogOut className="size-4" /> Sign out
              {clocking && <span className="ml-auto text-[11px] font-medium text-stone-400">stops your timer</span>}
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}