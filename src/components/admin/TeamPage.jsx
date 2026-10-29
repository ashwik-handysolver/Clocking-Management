import { useMemo, useState } from "react";
import { ChevronDown, Crown, Pencil, RotateCcw, Trash, UserMinus, Users } from "lucide-react";
import { formatHours, startOfDay } from "../../lib/time";
import { supabase } from "../../lib/supabase";
import { deleteMemberAccount, removeMember } from "../../store/db";
import { entrySeconds, isDone } from "../../store/model";
import { useStore } from "../../store/store";
import { useDialogs } from "../dialogs";
import { Avatar, Button, Card, EmptyState, Field, Modal, cx, inputClass } from "../ui";
import { AdminPage } from "./AdminPage";

/*
 * Team (admin): everyone with an account. Edit their name, role and colour, or remove them.
 * Removing someone deletes their sign-in, takes them off open subtasks and stops their timer,
 * but keeps their past time for timesheets and reports. Removed people can be let back in:
 * they sign up again with the same email and get their old profile back.
 */

export const COLORS = ["#f97316", "#2563eb", "#0d9488", "#9333ea", "#db2777", "#ca8a04", "#4f46e5", "#059669", "#dc2626", "#0891b2"];

export default function TeamPage() {
  const { state, items, teamEntries, me, actions } = useStore();
  const { confirm, toast } = useDialogs();
  const [editing, setEditing] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);

  const monthStart = useMemo(() => {
    const d = new Date();
    return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
  }, []);
  const statsFor = (m) => ({
    hours: teamEntries.filter((e) => e.memberId === m.id && e.start >= monthStart).reduce((t, e) => t + entrySeconds(e), 0),
    open: items.filter((i) => i.type === "subtask" && !isDone(i) && (i.assignees ?? []).includes(m.id)).length,
    live: teamEntries.some((e) => e.memberId === m.id && e.end == null),
  });

  const active = state.members.filter((m) => !m.removedAt).sort((a, b) => b.isAdmin - a.isAdmin || a.name.localeCompare(b.name));
  const removed = state.members.filter((m) => m.removedAt).sort((a, b) => b.removedAt - a.removedAt);
  const adminCount = active.filter((m) => m.isAdmin).length;

  const askRemove = (m) => {
    const s = statsFor(m);
    confirm({
      title: `Remove ${m.name}?`,
      message: `${m.name} won't be able to sign in any more${s.open ? `, will be taken off ${s.open} open subtask${s.open === 1 ? "" : "s"}` : ""}${s.live ? " and their running timer will be stopped" : ""}. Their past time stays in timesheets and reports.`,
      confirmLabel: "Remove from team",
      danger: true,
      onConfirm: async () => {
        try {
          await removeMember(m.id);
          toast(`${m.name} removed from the team`);
        } catch (err) {
          toast(`Couldn't remove: ${err.message ?? err}`, "error");
        }
      },
    });
  };

  // Delete for good: sign-in, profile, logged time and screenshots.
  const askDelete = (m) => {
    const hours = teamEntries.filter((e) => e.memberId === m.id).reduce((t, e) => t + entrySeconds(e), 0);
    const self = m.id === me.id;
    confirm({
      title: self ? "Delete your own account?" : `Delete ${m.name}'s account?`,
      message: `This permanently deletes ${m.name}'s sign-in, profile${hours ? `, all ${formatHours(hours)} of their logged time` : ""} and their screenshots. Reports and timesheets will no longer include their hours. This can't be undone. To keep their history, use Remove instead.`,
      confirmLabel: "Delete account",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteMemberAccount(m.id);
          if (self) {
            await supabase.auth.signOut({ scope: "local" }); // your account is gone: back to the sign-in page
            return;
          }
          toast(`${m.name}'s account was deleted`);
        } catch (err) {
          toast(`Couldn't delete: ${err.message ?? err}`, "error");
        }
      },
    });
  };

  const allowBack = (m) =>
    confirm({
      title: `Let ${m.name} back in?`,
      message: `${m.name} can then sign up again with ${m.email} and gets their old profile and history back.`,
      confirmLabel: "Allow back",
      onConfirm: () => {
        actions.updateMember(m.id, { removedAt: null });
        toast(`${m.name} can sign up again`);
      },
    });

  return (
    <AdminPage title="Team">
      <Card className="p-4 @md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-stone-700">
            {active.length} {active.length === 1 ? "person" : "people"}
          </p>
        </div>

        {!active.length ? (
          <EmptyState icon={Users} title="No team members yet" />
        ) : (
          <ul className="divide-y divide-stone-100">
            {active.map((m) => {
              const s = statsFor(m);
              const self = m.id === me.id;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 @xl:flex-nowrap">
                  <span className="relative">
                    <Avatar member={m} />
                    {s.live && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-surface" title="Clocked in" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-stone-900">
                      {m.name}
                      {self && <span className="font-medium text-stone-400">(you)</span>}
                      {m.isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 ring-1 ring-brand-100">
                          <Crown className="size-3" /> Admin
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {m.role || "No role set"} · {m.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right text-xs">
                    <span>
                      <span className="block font-extrabold text-stone-900 tabular-nums">{formatHours(s.hours)}</span>
                      <span className="text-stone-400">this month</span>
                    </span>
                    <span>
                      <span className="block font-extrabold text-stone-900 tabular-nums">{s.open}</span>
                      <span className="text-stone-400">open</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(m)}>
                      Edit
                    </Button>
                    {!m.isAdmin && !self && (
                      <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => askRemove(m)} title="Stop their access, keep their past time">
                        Remove
                      </Button>
                    )}
                    {/* Team members can be deleted; an admin only deletes their own account (and not if they're the last admin). */}
                    {(!m.isAdmin || (self && adminCount > 1)) && (
                      <Button
                        size="sm"
                        variant="dangerGhost"
                        iconOnly
                        icon={Trash}
                        aria-label={self ? "Delete your account" : `Delete ${m.name}'s account`}
                        title={self ? "Delete your own account permanently" : "Delete account (and their time) permanently"}
                        onClick={() => askDelete(m)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {removed.length > 0 && (
        <Card className="p-4 @md:p-5">
          <button type="button" onClick={() => setShowRemoved((v) => !v)} aria-expanded={showRemoved} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="text-sm font-bold text-stone-700">Removed ({removed.length})</span>
            <ChevronDown className={cx("size-4 text-stone-400 transition-transform", showRemoved && "rotate-180")} />
          </button>
          {showRemoved && (
            <ul className="mt-3 divide-y divide-stone-100">
              {removed.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5 opacity-80">
                  <Avatar member={m} size="sm" className="grayscale" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-700">{m.name}</p>
                    <p className="truncate text-xs text-stone-400">
                      {m.email} · removed {new Date(m.removedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => allowBack(m)}>
                    Allow back
                  </Button>
                  <Button size="sm" variant="dangerGhost" iconOnly icon={Trash} aria-label={`Delete ${m.name} permanently`} title="Delete permanently, with their time" onClick={() => askDelete(m)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {editing && <EditMember member={editing} onClose={() => setEditing(null)} />}
    </AdminPage>
  );
}

function EditMember({ member, onClose }) {
  const { actions, me } = useStore();
  const self = member.id === me.id;
  const [admin, setAdmin] = useState(!!member.isAdmin);
  const { toast } = useDialogs();
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role ?? "");
  const [color, setColor] = useState(member.color);
  const [error, setError] = useState("");

  const save = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    actions.updateMember(member.id, { name: name.trim(), role: role.trim(), color, ...(!self && { isAdmin: admin }) });
    toast("Team member updated");
    onClose();
  };

  return (
    <Modal
      as="form"
      onSubmit={save}
      noValidate
      title={`Edit ${member.name}`}
      subtitle={member.email}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
          <Avatar member={{ ...member, name: name || member.name, color }} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-stone-900">{name || "—"}</p>
            <p className="truncate text-xs text-stone-500">{role || "No role set"}</p>
          </div>
        </div>
        <Field label="Full name" required error={error}>
          <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Role">
          <input value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-bold text-stone-600">Access</span>
          <div role="radiogroup" aria-label="Access" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1">
            {[
              [false, "Team member", "Their own work and time"],
              [true, "Admin", "Everything, incl. team and reports"],
            ].map(([value, label, sub]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={admin === value}
                disabled={self}
                onClick={() => setAdmin(value)}
                className={cx("rounded-xl px-3 py-2 text-left transition disabled:cursor-not-allowed", admin === value ? "bg-surface shadow-sm" : "hover:bg-white/60")}
              >
                <span className={cx("block text-sm font-bold", admin === value ? "text-stone-900" : "text-stone-500")}>{label}</span>
                <span className="block text-[11px] text-stone-400">{sub}</span>
              </button>
            ))}
          </div>
          <span className="mt-1.5 block text-xs text-stone-400">
            {self ? "You can't change your own access." : admin && !member.isAdmin ? "They'll see every page, all time and screenshots." : ""}
          </span>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-bold text-stone-600">Colour</span>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={cx("size-8 rounded-full transition", color === c ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-surface" : "hover:scale-110")}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
