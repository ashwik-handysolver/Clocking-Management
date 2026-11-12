import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Clock, Eye, FolderKanban, LayoutDashboard, ListChecks, LogOut } from "lucide-react";
import { navigate, useRoute } from "../../lib/router";
import { supabase } from "../../lib/supabase";
import { formatDate, formatHours, fromDateKey, todayKey } from "../../lib/time";
import { cycleHistory, cycleStats } from "../../store/clientHours";
import { loadClientPortal } from "../../store/db";
import { buildIndex, clientCycle, isDone, pathLabel, progressOf, subtaskIdsUnder } from "../../store/model";
import { Avatar, Button, Card, EmptyState, IconChip, ProgressBar, cx } from "../ui";
import { Hero, HeroStat } from "../work/DashboardParts";
import { HoursPage, ScreenshotsPage, WorkPage, secondsIn } from "./ClientPages";

/*
 * The client portal: what a client account sees after signing in. View only — the database lets
 * a client read their own client's work, billable time, the people on it and their screenshots,
 * and nothing can be changed from here.
 */

const PAGES = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "work", label: "Work", icon: ListChecks },
  { key: "hours", label: "Hours", icon: Clock },
  { key: "screenshots", label: "Screenshots", icon: Camera },
];

/** Loads the portal's data, and again when the tab comes back into view after a minute or more. */
function usePortalData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await loadClientPortal());
      setError("");
    } catch (err) {
      setError(err.message ?? String(err));
    }
  }, []);
  useEffect(() => {
    load();
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);
  return { data, error, load };
}

const signOut = () => supabase.auth.signOut({ scope: "local" });

export default function ClientPortal({ access }) {
  const { data, error, load } = usePortalData();
  const route = useRoute();
  const page = PAGES.some((p) => p.key === route.page) ? route.page : "overview";
  const [user, setUser] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: d }) => setUser(d.user));
  }, []);
  const name = user?.user_metadata?.name?.trim() || access.email.split("@")[0];

  const view = useMemo(() => {
    if (!data) return null;
    const items = data.items.filter((i) => !i.archived);
    return {
      items,
      index: buildIndex(items),
      client: items.find((i) => i.id === access.clientId && i.type === "client"),
      entries: data.entries,
      team: new Map(data.team.map((m) => [m.id, m])),
      holidays: new Set(data.holidays.map((h) => h.day)),
    };
  }, [data, access.clientId]);

  if (!view) {
    return (
      <Centered>
        {error ? (
          <>
            <h1 className="text-lg font-extrabold text-stone-900">Couldn't load your workspace</h1>
            <p className="mt-1.5 text-sm text-stone-500">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="primary" onClick={load}>Try again</Button>
              <Button variant="ghost" onClick={signOut}>Sign out</Button>
            </div>
          </>
        ) : (
          <p className="animate-skeleton text-sm font-semibold text-stone-400">Loading…</p>
        )}
      </Centered>
    );
  }
  if (!view.client) {
    return (
      <Centered>
        <h1 className="text-lg font-extrabold text-stone-900">Nothing to show yet</h1>
        <p className="mt-1.5 text-sm text-stone-500">Your access isn't linked to a client any more. Please contact HandySolver.</p>
        <Button className="mt-4" variant="ghost" icon={LogOut} onClick={signOut}>Sign out</Button>
      </Centered>
    );
  }

  return <PortalView view={view} name={name} page={page} projectId={route.id} />;
}

/** The portal's pages around already-loaded data. */
export function PortalView({ view, name, page, projectId }) {
  const props = { ...view, name };
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-stone-900/5 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src="/favicon.svg" alt="HandySolver" className="size-9 shrink-0 rounded-[8px] shadow-soft" />
          <div className="min-w-0">
            <p className="text-sm leading-tight font-extrabold text-stone-900">Clockwork</p>
            <p className="truncate text-xs font-semibold text-stone-500">{view.client.name}</p>
          </div>
          <Tabs page={page} className="ml-4 hidden md:flex" />
          <span className="flex-1" />
          <span className="hidden items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500 sm:flex">
            <Eye className="size-3.5" /> View only
          </span>
          <Button variant="ghost" size="sm" icon={LogOut} onClick={signOut}>
            Sign out
          </Button>
        </div>
        <Tabs page={page} className="flex overflow-x-auto px-4 pb-2 md:hidden" />
      </header>

      <main className="@container mx-auto max-w-6xl space-y-4 p-4 pb-10">
        {page === "overview" && <Overview {...props} />}
        {page === "work" && <WorkPage {...props} projectId={projectId} />}
        {page === "hours" && <HoursPage {...props} />}
        {page === "screenshots" && <ScreenshotsPage {...props} />}
      </main>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

function Tabs({ page, className }) {
  return (
    <nav aria-label="Pages" className={cx("gap-1", className)}>
      {PAGES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => navigate(key)}
          aria-current={page === key ? "page" : undefined}
          className={cx(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold whitespace-nowrap transition",
            page === key ? "bg-surface text-brand-700 shadow-sm ring-1 ring-stone-900/5" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </nav>
  );
}

export function SectionTitle({ icon, title, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-stone-900">
        <IconChip icon={icon} tone="brand" size="sm" />
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ---------- Overview ---------- */

function Overview({ client, index, entries, team, holidays, name }) {
  const now = Date.now();
  const today = todayKey();
  const cycle = clientCycle(client, today);
  const stats = cycle ? cycleStats({ cycle, entries, index, holidays, now, today }) : null;
  const d = new Date(now);
  const monthSecs = secondsIn(entries, new Date(d.getFullYear(), d.getMonth(), 1).getTime(), now + 1, now);
  const subtasks = [...index.byId.values()].filter((i) => i.type === "subtask");
  const done = subtasks.filter(isDone).length;

  return (
    <>
      <Hero name={name.split(" ")[0]} title={`Here's the latest on ${client.name}`}>
        <div className="grid w-full grid-cols-3 items-stretch gap-2.5 @3xl:w-[32rem]">
          {stats ? (
            <HeroStat label="This cycle" value={formatHours(stats.used)} sub={`of ${cycle.hours}h`} />
          ) : (
            <HeroStat label="All time" value={formatHours(secondsIn(entries, 0, now + 1, now))} />
          )}
          <HeroStat label="This month" value={formatHours(monthSecs)} />
          <HeroStat label="Subtasks done" value={`${done}/${subtasks.length}`} />
        </div>
      </Hero>

      <HoursChart client={client} index={index} entries={entries} now={now} today={today} />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <ProjectsCard client={client} index={index} entries={entries} now={now} />
        <RecentWork index={index} entries={entries} team={team} now={now} />
      </div>
    </>
  );
}

/** Billable hours per billing cycle (with the client's hours as a target line), or per month when no hours are set. */
function HoursChart({ client, index, entries, now, today }) {
  let bars;
  let target = 0;
  if (client.budgetHours) {
    const months = client.cycleMonths || 1;
    target = client.budgetHours * 3600;
    bars = cycleHistory({ client, entries, index, now, today, max: 6 }).map((c) => ({
      key: c.start,
      label:
        months === 1 && c.start.endsWith("-01")
          ? formatDate(fromDateKey(c.start), { month: "short", year: "2-digit" })
          : `${formatDate(fromDateKey(c.start))} – ${formatDate(fromDateKey(c.end))}`,
      secs: c.seconds,
      current: c.current,
    }));
  } else {
    const d = new Date(now);
    bars = Array.from({ length: 6 }, (_, i) => {
      const from = new Date(d.getFullYear(), d.getMonth() - 5 + i, 1).getTime();
      const to = new Date(d.getFullYear(), d.getMonth() - 4 + i, 1).getTime();
      return { key: from, label: formatDate(from, { month: "short", year: "2-digit" }), secs: secondsIn(entries, from, to, now), current: i === 5 };
    });
  }
  const top = Math.max(target, ...bars.map((b) => b.secs), 3600) * 1.15;

  return (
    <Card className="p-5">
      <SectionTitle icon={FolderKanban} title={client.budgetHours ? "Hours per billing cycle" : "Hours per month"}>
        {target > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <span className="w-5 border-t-2 border-dashed border-stone-400" /> {client.budgetHours}h per cycle
          </span>
        )}
      </SectionTitle>
      {!bars.length ? (
        <EmptyState icon={Clock} title="No hours yet" />
      ) : (
        <>
          <div className="relative flex h-52 items-end gap-3 border-b border-stone-200 sm:gap-6">
            {target > 0 && <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-stone-300" style={{ bottom: `${(target / top) * 100}%` }} />}
            {bars.map((b, i) => {
              const over = target > 0 && b.secs > target;
              return (
                <div key={b.key} className="relative h-full min-w-0 flex-1" title={`${b.label}: ${formatHours(b.secs)}`}>
                  <span
                    className={cx(
                      "absolute inset-x-0 bottom-0 mx-auto w-full max-w-16 origin-bottom animate-grow-y rounded-t-md",
                      over ? "bg-red-500" : b.current ? "bg-brand-300" : "bg-brand-500",
                    )}
                    style={{ height: b.secs ? `${Math.max(2, (b.secs / top) * 100)}%` : "2px", animationDelay: `${i * 60}ms` }}
                  />
                  <span className="absolute inset-x-0 text-center text-sm font-extrabold text-stone-800 tabular-nums" style={{ bottom: `calc(${(b.secs / top) * 100}% + 4px)` }}>
                    {formatHours(b.secs)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-3 sm:gap-6">
            {bars.map((b) => (
              <span key={b.key} className={cx("min-w-0 flex-1 truncate text-center text-xs font-bold", b.current ? "text-brand-600" : "text-stone-500")}>
                {b.label}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function ProjectsCard({ client, index, entries, now }) {
  const projects = index.childrenOf(client.id).filter((p) => p.type === "project");
  return (
    <Card className="p-5">
      <SectionTitle icon={FolderKanban} title="Projects" />
      {!projects.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet" />
      ) : (
        <ul className="stagger -mx-2 space-y-1">
          {projects.map((p) => {
            const prog = progressOf(index, p.id);
            const ids = subtaskIdsUnder(index, p.id);
            const secs = secondsIn(entries.filter((e) => ids.has(e.subtaskId)), 0, now + 1, now);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => navigate("work", p.id)} className="group w-full rounded-xl px-2 py-2.5 text-left hover:bg-brand-50/70">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-bold text-stone-800 group-hover:text-brand-700">{p.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-stone-500 tabular-nums">
                      {formatHours(secs)} · {prog.done}/{prog.total} done
                    </span>
                  </span>
                  <ProgressBar value={prog.pct} tone={prog.pct === 100 ? "green" : "brand"} className="mt-2" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const RECENT = 8;

function RecentWork({ index, entries, team, now }) {
  const recent = [...entries].sort((a, b) => b.start - a.start).slice(0, RECENT);
  return (
    <Card className="p-5">
      <SectionTitle icon={Clock} title="Recent work">
        <Button variant="ghost" size="sm" onClick={() => navigate("hours")}>
          All hours
        </Button>
      </SectionTitle>
      {!recent.length ? (
        <EmptyState icon={Clock} title="No hours logged yet" />
      ) : (
        <ul className="stagger -mx-2 space-y-0.5">
          {recent.map((e) => {
            const sub = index.get(e.subtaskId);
            const person = team.get(e.memberId);
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar member={person} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-stone-800">{sub?.name ?? "Subtask"}</span>
                  <span className="block truncate text-xs text-stone-400">
                    {person?.name ?? "Team member"} · {sub ? pathLabel(index, sub.id).split(" / ").slice(1).join(" › ") : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs leading-tight">
                  <span className="block font-extrabold text-stone-900 tabular-nums">{formatHours(secondsIn([e], 0, now + 1, now))}</span>
                  <span className="text-stone-400">{formatDate(e.start)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
