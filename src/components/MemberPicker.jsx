import { Check, ChevronDown, Lock, X } from "lucide-react";
import { assignableMembers } from "../store/permissions";
import { useStore } from "../store/store";
import { Avatar, AvatarStack, Popover, cx } from "./ui";

/**
 * Pick one or more team members for a subtask.
 * Any team member except the admin, yourself included (store/permissions.js).
 * `variant="field"` looks like a form input; `"inline"` is the compact version for the details panel.
 */
export default function MemberPicker({ value = [], onChange, variant = "field", invalid, readOnly }) {
  const { state, memberById, me } = useStore();
  const options = assignableMembers(state.members, me);
  const selected = value.map((id) => memberById.get(id)).filter(Boolean);
  const names = selected.map((m) => (m.id === me.id ? "You" : m.name.split(" ")[0])).join(", ");

  if (readOnly)
    return (
      <div
        title="You're assigned to this subtask, so you can't change who it's assigned to"
        className={cx(
          "flex w-full min-w-0 cursor-not-allowed items-center gap-2",
          variant === "field" ? "min-h-10 rounded-xl bg-stone-50 px-3 py-1.5 ring-1 ring-stone-200" : "py-0.5",
        )}
      >
        <AvatarStack members={selected} max={3} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{names}</span>
        <Lock className="size-3.5 shrink-0 text-stone-400" />
      </div>
    );
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover
      align="left"
      className="w-64"
      trigger={({ toggle: open, open: isOpen }) => (
        <button
          type="button"
          onClick={open}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cx(
            "flex w-full min-w-0 items-center gap-2 text-left",
            variant === "field"
              ? cx(
                  "min-h-10 rounded-xl bg-stone-50 px-3 py-1.5 ring-1 transition hover:ring-stone-300",
                  isOpen ? "bg-surface ring-2 ring-brand-500" : invalid ? "ring-red-300" : "ring-stone-200",
                )
              : "rounded-lg py-0.5 hover:bg-stone-100",
          )}
        >
          {selected.length ? (
            <>
              <AvatarStack members={selected} max={3} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
                {selected.map((m) => (m.id === me.id ? "You" : m.name.split(" ")[0])).join(", ")}
              </span>
            </>
          ) : (
            <span className="flex-1 text-sm text-stone-400">Select team members…</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-stone-400" />
        </button>
      )}
    >
      {() => (
        <div role="listbox" aria-multiselectable="true">
          <p className="px-3 pt-2 pb-1.5 text-[11px] font-bold tracking-widest text-stone-400 uppercase">Working on this</p>
          {options.map((m) => {
            const on = value.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(m.id)}
                className={cx("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition", on ? "bg-brand-50" : "hover:bg-stone-50")}
              >
                <Avatar member={m} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-800">
                    {m.name}
                    {m.id === me.id && <span className="ml-1 font-medium text-stone-400">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-stone-400">{m.role}</span>
                </span>
                <span className={cx("grid size-5 place-items-center rounded-md ring-1", on ? "bg-brand-500 text-white ring-brand-500" : "ring-stone-300")}>
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 flex w-full items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-50"
            >
              <X className="size-3.5" /> Clear selection
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
