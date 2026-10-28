import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { openItem } from "../../lib/router";
import { TYPE_LABEL, pathLabel } from "../../store/model";
import { useStore } from "../../store/store";
import { TYPE_ICON } from "../ItemForm";
import { StatusIcon, cx } from "../ui";

/** Ctrl/⌘+K quick-jump to any client, project, task or subtask. */
export default function CommandPalette({ onClose }) {
  const { items, index } = useStore(); // only what you're allowed to see
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.tags ?? []).some((t) => t.toLowerCase().includes(q)))
      : [...items].sort((a, b) => b.createdAt - a.createdAt);
    return pool.slice(0, 9);
  }, [query, items]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item) => {
    openItem(item.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Search" className="h-fit w-full max-w-xl animate-pop overflow-hidden rounded-3xl bg-surface shadow-float ring-1 ring-stone-900/5">
        <div className="flex items-center gap-3 border-b border-stone-100 px-5">
          <Search className="size-5 text-brand-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) choose(results[active]);
            }}
            placeholder="Jump to a client, project, task…"
            className="h-16 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400"
          />
          <kbd className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-500">Esc</kbd>
        </div>
        <p className="px-5 pt-3 text-[11px] font-bold tracking-widest text-stone-400 uppercase">{query.trim() ? "Results" : "Recently added"}</p>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2 scrollbar-thin">
          {results.map((item, i) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => choose(item)}
                  onMouseMove={() => setActive(i)}
                  className={cx("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left", i === active && "bg-brand-50")}
                >
                  <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", i === active ? "bg-surface text-brand-600 shadow-sm" : "bg-stone-100 text-stone-500")}>
                    {item.status && item.type !== "project" ? <StatusIcon status={item.status} /> : <Icon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-800">{item.name}</span>
                    <span className="block truncate text-xs text-stone-400">
                      {TYPE_LABEL[item.type]}
                      {item.parentId && ` · ${pathLabel(index, item.id)}`}
                    </span>
                  </span>
                  {i === active && <CornerDownLeft className="size-4 text-brand-500" />}
                </button>
              </li>
            );
          })}
          {!results.length && <li className="px-3 py-8 text-center text-sm text-stone-500">No results for “{query}”</li>}
        </ul>
      </div>
    </div>
  );
}
