import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Building } from "lucide-react";
import { openItem } from "../../lib/router";
import { formatHours, todayKey } from "../../lib/time";
import { cycleStats } from "../../store/clientHours";
import { ancestry, assigneesOf, clientCycle, descendants, liveItemIds, rollupSeconds } from "../../store/model";
import { isAdmin } from "../../store/permissions";
import { useStore } from "../../store/store";
import { AvatarStack, Card, EmptyState, ADD_HINT, cx } from "../ui";

/*
 * Clients & Projects overview: every client in one sortable table (projects, this cycle's hours,
 * team and time). A row opens the client.
 * Time is the team's for the admin, your own for everyone else.
 */

// Bar colour for this billing cycle's hours.
const CYCLE_BAR = { over: "bg-red-500", behind: "bg-amber-500", "on-track": "bg-brand-500", ahead: "bg-brand-500", upcoming: "bg-stone-300" };

/** Each client's current billing cycle (clients with hours set): Map(clientId → { cycle, stats }). */
function useCycles(entries, now) {
  const { allIndex: index, state } = useStore();
  return useMemo(() => {
    const today = todayKey();
    const holidays = new Set((state.holidays ?? []).map((h) => h.day));
    const byClient = new Map();
    for (const e of entries) {
      const client = ancestry(index, e.subtaskId).find((x) => x.type === "client");
      if (!client) continue;
      if (!byClient.has(client.id)) byClient.set(client.id, []);
      byClient.get(client.id).push(e);
    }
    const out = new Map();
    for (const c of state.items) {
      if (c.type !== "client" || c.archived) continue;
      const cycle = clientCycle(c, today);
      if (!cycle) continue;
      out.set(c.id, { cycle, stats: cycleStats({ cycle, entries: byClient.get(c.id) ?? [], index, holidays, now, today }) });
    }
    return out;
  }, [entries, index, state.items, state.holidays, now]);
}

export default function WorkOverview() {
  const { index, memberById, entries, teamEntries, me } = useStore();
  const admin = isAdmin(me);
  const timeEntries = admin ? teamEntries : entries;
  const seconds = useMemo(() => rollupSeconds(index, timeEntries), [index, timeEntries]);
  const live = useMemo(() => liveItemIds(index, timeEntries), [index, timeEntries]);
  const [now] = useState(() => Date.now());
  const cycles = useCycles(admin ? teamEntries : [], now);
  const [sort, setSort] = useState({ key: "name", dir: 1 });

  const rows = index.childrenOf(null).map((c) => {
    const all = descendants(index, c.id);
    return {
      c,
      projects: index.childrenOf(c.id).length,
      people: [...new Set(all.flatMap(assigneesOf))].map((id) => memberById.get(id)).filter(Boolean),
      secs: seconds.get(c.id) ?? 0,
      cycle: cycles.get(c.id),
    };
  });

  const value = {
    name: (r) => r.c.name.toLowerCase(),
    projects: (r) => r.projects,
    cycle: (r) => (r.cycle ? r.cycle.stats.pct : -1),
    people: (r) => r.people.length,
    time: (r) => r.secs,
  };
  rows.sort((a, b) => {
    const x = value[sort.key](a);
    const y = value[sort.key](b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });

  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={Building} title={admin ? "Start by adding a client" : "No clients yet"} text={admin ? ADD_HINT : undefined} />
      </Card>
    );
  }

  const head = (k, children, className) => {
    const on = sort.key === k;
    const Arrow = sort.dir > 0 ? ArrowUp : ArrowDown;
    return (
      <th key={k} className={cx("px-3 pb-2.5 font-medium", className)} aria-sort={on ? (sort.dir > 0 ? "ascending" : "descending") : undefined}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : k === "name" ? 1 : -1 }))}
          className={cx("inline-flex items-center gap-1 hover:text-stone-900", on && "text-stone-900")}
        >
          {children}
          {on && <Arrow className="size-3" />}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-3">
    <Card className="p-2 @md:p-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="text-xs text-stone-500">
              {head("name", "Client", "min-w-52")}
              {head("projects", "Projects", "w-24 text-right")}
              {admin && head("cycle", "This cycle", "w-64")}
              {head("people", "Team", "w-32")}
              {head("time", admin ? "Team time" : "Your time", "w-28 text-right")}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(({ c, projects, people, secs, cycle }) => (
              // One line per client and a fixed height, so every row is the same size.
              <tr key={c.id} onClick={() => openItem(c.id)} className="h-12 cursor-pointer hover:bg-stone-50">
                <td className="max-w-0 px-3">
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 truncate font-medium text-stone-900">{c.name}</span>
                    {live.has(c.id) && <span title="Someone's clocked in here" className="size-1.5 shrink-0 rounded-full bg-emerald-500" />}
                    {c.contactName && c.contactName !== c.name && <span className="min-w-0 truncate text-xs text-stone-400">{c.contactName}</span>}
                  </span>
                </td>
                <td className="px-3 text-right text-stone-600 tabular-nums">{projects}</td>
                {admin && (
                  <td className="px-3">
                    {cycle ? (
                      <span className="flex items-center gap-2.5">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                          <span className={cx("block h-full rounded-full", CYCLE_BAR[cycle.stats.status] ?? "bg-brand-500")} style={{ width: `${Math.min(100, cycle.stats.pct)}%` }} />
                        </span>
                        <span className="w-28 shrink-0 text-right text-xs whitespace-nowrap text-stone-500 tabular-nums">
                          {formatHours(cycle.stats.used)} / {cycle.cycle.hours}h
                        </span>
                      </span>
                    ) : (
                      // Same slot as the hours on other rows, so the column lines up
                      <span className="flex items-center gap-2.5">
                        <span className="flex-1" />
                        <span className="w-28 shrink-0 text-right text-xs whitespace-nowrap text-stone-400">No hours set</span>
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3">{people.length ? <AvatarStack members={people} max={3} size="xs" /> : <span className="text-xs text-stone-400">—</span>}</td>
                <td className="px-3 text-right font-medium text-stone-900 tabular-nums">{formatHours(secs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    </div>
  );
}
