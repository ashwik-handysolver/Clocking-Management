import { useMemo, useState } from "react";
import {
  BadgeDollarSign, ChevronLeft, ChevronRight, CircleSlash, Clock, History, Pencil, PencilLine, Plus, Square, Trash,
} from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { openItem } from "../../lib/router";
import { addDays, formatDate, formatHours, formatTime, startOfWeek, timeAgo } from "../../lib/time";
import { BILLING_LABEL, billingOf, entryBilling, entrySeconds, pathLabel, workingMembers } from "../../store/model";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Avatar, Button, Card, EmptyState, Select, cx } from "../ui";
import { AdminPage, Pager, Segmented } from "./AdminPage";

/*
 * Admin timesheets: one week of team clockings at a time, filtered by person and billing,
 * 15 rows per page. The admin corrects time here (edit, delete, stop a forgotten timer,
 * move between billable and non-billable); every change lands in "Change history".
 */

const PER_PAGE = 15;

export default function Timesheets() {
  const [tab, setTab] = useState("entries");
  const { openEntryForm } = useDialogs();
  return (
    <AdminPage
      title="Timesheets"
      action={
        <Button variant="primary" size="sm" icon={Plus} onClick={() => openEntryForm({})}>
          Log time for someone
        </Button>
      }
    >
      <Segmented
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          ["entries", "Clockings"],
          ["history", "Change history"],
        ]}
      />
      {tab === "entries" ? <Entries /> : <ChangeHistory />}
    </AdminPage>
  );
}

function Entries() {
  const { state, teamEntries, allIndex: index, memberById, actions, audit } = useStore();
  const { openEntryForm, confirm, toast } = useDialogs();
  const team = workingMembers(state.members, state.items, teamEntries);
  const [week, setWeek] = useState(0); // 0 = this week, -1 = last week…
  const [who, setWho] = useState("");
  const [billing, setBilling] = useState("all");
  const [page, setPage] = useState(0);
  const now = useNow(teamEntries.some((e) => e.end == null), 30_000);

  const from = addDays(startOfWeek(now), week * 7);
  const to = addDays(from, 7);
  const rows = useMemo(
    () =>
      teamEntries
        .filter((e) => e.start < to && (e.end ?? now) > from)
        .filter((e) => !who || e.memberId === who)
        .filter((e) => billing === "all" || entryBilling(index, e) === billing)
        .sort((a, b) => b.start - a.start),
    [teamEntries, from, to, now, who, billing, index],
  );
  const changed = useMemo(() => new Set(audit.map((a) => a.entryId)), [audit]);
  const shown = rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const sum = (list) => list.reduce((t, e) => t + entrySeconds(e, now), 0);
  const billable = sum(rows.filter((e) => entryBilling(index, e) === "billable"));
  const total = sum(rows);
  const reset = (fn) => (v) => {
    fn(v);
    setPage(0);
  };

  const remove = (e) => {
    const m = memberById.get(e.memberId);
    confirm({
      title: "Delete time entry?",
      message: `${formatHours(entrySeconds(e, now))} logged by ${m?.name ?? "someone"} on ${formatDate(e.start)} will be removed. This is recorded in the change history.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        actions.deleteEntry(e.id);
        toast("Time entry deleted");
      },
    });
  };
  const stop = (e) => {
    const m = memberById.get(e.memberId);
    confirm({
      title: `Stop ${m?.name.split(" ")[0]}'s timer?`,
      message: `The timer has been running since ${formatTime(e.start)} (${formatHours(entrySeconds(e, now))}). It will be stopped now.`,
      confirmLabel: "Stop timer",
      onConfirm: () => {
        actions.stopMemberTimer(e.memberId);
        toast("Timer stopped");
      },
    });
  };
  const move = (e) => {
    const next = entryBilling(index, e) === "billable" ? "non-billable" : "billable";
    actions.setEntryBilling(e.id, next);
    toast(`Moved to ${BILLING_LABEL[next].toLowerCase()}`);
  };

  return (
    <Card className="p-4 @md:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} aria-label="Previous week" onClick={() => reset(setWeek)(week - 1)} />
          <span className="min-w-36 text-center text-sm font-bold text-stone-800">
            {formatDate(from)} – {formatDate(addDays(to, -1))}
          </span>
          <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} aria-label="Next week" disabled={week >= 0} onClick={() => reset(setWeek)(week + 1)} />
          {week !== 0 && (
            <Button size="sm" variant="soft" onClick={() => reset(setWeek)(0)}>
              This week
            </Button>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select
            aria-label="Team member"
            value={who}
            onChange={(e) => reset(setWho)(e.target.value)}
            options={[{ value: "", label: "Everyone" }, ...team.map((m) => ({ value: m.id, label: m.name }))]}
            className="!h-9 min-w-36 text-xs"
          />
          <Select
            aria-label="Billing"
            value={billing}
            onChange={(e) => reset(setBilling)(e.target.value)}
            options={[
              { value: "all", label: "All billing" },
              { value: "billable", label: "Billable" },
              { value: "non-billable", label: "Non-billable" },
            ]}
            className="!h-9 min-w-32 text-xs"
          />
        </div>
      </div>

      <p className="mb-3 text-sm text-stone-500">
        <span className="font-extrabold text-stone-900">{formatHours(total)}</span> in {rows.length} clocking{rows.length === 1 ? "" : "s"} ·{" "}
        {formatHours(billable)} billable · {formatHours(total - billable)} non-billable
      </p>

      {!shown.length ? (
        <EmptyState icon={Clock} title="No clockings" />
      ) : (
        <div className="relative -mx-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold tracking-wide text-stone-400 uppercase">
                <th className="px-2 pb-2">Member</th>
                <th className="px-2 pb-2">Subtask</th>
                <th className="w-36 px-2 pb-2">When</th>
                <th className="w-20 px-2 pb-2 text-right">Duration</th>
                <th className="w-32 px-2 pb-2 text-right">Billing</th>
                <th className="w-28 px-2 pb-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shown.map((e) => {
                const m = memberById.get(e.memberId);
                const sub = index.get(e.subtaskId);
                const live = e.end == null;
                const b = entryBilling(index, e);
                const moved = e.billing && e.billing !== (billingOf(index, e.subtaskId) ?? "billable");
                return (
                  <tr key={e.id} className="group hover:bg-stone-50">
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        {m && <Avatar member={m} size="xs" />}
                        <span className="truncate font-semibold text-stone-800">{m?.name.split(" ")[0] ?? "—"}</span>
                      </span>
                    </td>
                    <td className="max-w-0 px-2 py-2.5">
                      <button type="button" onClick={() => sub && openItem(sub.id)} className="block w-full truncate text-left font-semibold text-stone-800 hover:text-brand-700">
                        {sub?.name ?? "Deleted subtask"}
                      </button>
                      <span className="flex items-center gap-1.5 truncate text-xs text-stone-400">
                        {e.source === "manual" && (
                          <span title="Logged manually" className="inline-flex items-center gap-0.5 text-stone-500">
                            <PencilLine className="size-3" /> Manual ·
                          </span>
                        )}
                        {changed.has(e.id) && (
                          <span title="Changed by the admin" className="inline-flex items-center gap-0.5 font-semibold text-amber-600">
                            <History className="size-3" /> Edited ·
                          </span>
                        )}
                        <span className="truncate">{sub ? pathLabel(index, sub.id).replaceAll(" / ", " › ") : ""}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-stone-600">
                      {formatDate(e.start)} · {formatTime(e.start)}–{live ? "now" : formatTime(e.end)}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {live && <span className="mr-1.5 inline-block size-2 animate-pulse-dot rounded-full bg-emerald-500" />}
                      <span className="font-bold text-stone-900">{formatHours(entrySeconds(e, now))}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <BillingPill billing={b} moved={moved} onClick={() => move(e)} />
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex justify-end gap-0.5">
                        {live && (
                          <Button size="xs" variant="soft" icon={Square} onClick={() => stop(e)} title="Stop this timer">
                            Stop
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" iconOnly icon={Pencil} aria-label="Edit entry" title="Edit entry" onClick={() => openEntryForm({ entryId: e.id })} />
                        <Button size="xs" variant="dangerGhost" iconOnly icon={Trash} aria-label="Delete entry" title="Delete entry" onClick={() => remove(e)} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={rows.length} perPage={PER_PAGE} onPage={setPage} />
    </Card>
  );
}

export function BillingPill({ billing, moved, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${moved ? "Moved by admin. " : ""}Move to ${billing === "billable" ? "non-billable" : "billable"}`}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition",
        billing === "billable" ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
      )}
    >
      {billing === "billable" ? <BadgeDollarSign className="size-3" /> : <CircleSlash className="size-3" />}
      {BILLING_LABEL[billing]}
      {moved && <span aria-label="moved" className="size-1.5 rounded-full bg-current opacity-60" />}
    </button>
  );
}

const KIND_LABEL = { edited: "Edited", deleted: "Deleted", stopped: "Stopped timer", logged: "Logged", billing: "Moved billing" };
const KIND_TONE = {
  edited: "bg-amber-100 text-amber-700",
  deleted: "bg-red-100 text-red-700",
  stopped: "bg-sky-100 text-sky-700",
  logged: "bg-emerald-100 text-emerald-700",
  billing: "bg-violet-100 text-violet-700",
};

/** Who changed whose time, newest first, 15 at a time. */
function ChangeHistory() {
  const { state, audit, allIndex: index, memberById, teamEntries } = useStore();
  const team = workingMembers(state.members, state.items, teamEntries);
  const [who, setWho] = useState("");
  const [page, setPage] = useState(0);
  const rows = audit.filter((a) => !who || a.memberId === who);
  const shown = rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const now = Date.now();

  return (
    <Card className="p-4 @md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Select
          aria-label="Whose time"
          value={who}
          onChange={(e) => {
            setWho(e.target.value);
            setPage(0);
          }}
          options={[{ value: "", label: "Everyone" }, ...team.map((m) => ({ value: m.id, label: m.name }))]}
          className="!h-9 min-w-36 text-xs"
        />
      </div>
      {!shown.length ? (
        <EmptyState icon={History} title="No changes yet" />
      ) : (
        <ul className="divide-y divide-stone-100">
          {shown.map((a) => {
            const by = memberById.get(a.by);
            const owner = memberById.get(a.memberId);
            const sub = index.get(a.subtaskId);
            return (
              <li key={a.id} className="flex gap-3 py-3">
                {by ? <Avatar member={by} size="sm" /> : <span className="size-7" />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", KIND_TONE[a.kind])}>{KIND_LABEL[a.kind] ?? a.kind}</span>
                    <span className="font-bold text-stone-900">{by?.name ?? "Someone"}</span>
                    <span className="text-stone-500">changed {owner ? `${owner.name}'s` : "a"} time</span>
                  </p>
                  <p className="mt-0.5 text-sm text-stone-700">{a.text}</p>
                  <p className="truncate text-xs text-stone-400">
                    {sub ? `${sub.name} · ` : ""}
                    {timeAgo(a.at, now)} · {new Date(a.at).toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} total={rows.length} perPage={PER_PAGE} onPage={setPage} />
    </Card>
  );
}
