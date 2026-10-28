import { useState } from "react";
import { X } from "lucide-react";
import { cx } from "./ui";

export default function TagInput({ value, onChange, suggestions = [], placeholder = "Add a tag…" }) {
  const [draft, setDraft] = useState("");
  const listId = "tag-suggestions";

  const add = (raw) => {
    const tag = raw.trim().replace(/,$/, "");
    if (tag && !value.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div
      className={cx(
        "flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl bg-stone-50 px-2.5 py-1.5 ring-1 ring-stone-200 transition hover:ring-stone-300",
        "focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand-500",
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-0.5 pr-1 pl-2.5 text-xs font-bold text-brand-700">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full p-0.5 hover:bg-brand-200">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
