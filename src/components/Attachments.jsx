import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Lock, Paperclip, X } from "lucide-react";
import { attachmentUrls, uploadAttachment } from "../store/db";
import { cx } from "./ui";

/*
 * Media in descriptions. Each uploaded file is saved at the end of the description as one line:
 *   ![photo.png](attachment:<storage path>)
 * The editor never shows those lines: the box holds just the text and the files sit underneath
 * as thumbnails. When the description is shown, the lines become the picture / video / file.
 */

const TOKEN = /!\[([^\]]*)\]\(attachment:([^)\s]+)\)/g;
const MAX_BYTES = 2 * 1024 * 1024;

const kindOf = (name) => {
  const ext = name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "aac"].includes(ext)) return "audio";
  return "file";
};

/** A saved description split into its text and its files. */
// The files block at the end: "\n\n" then one file line each.
const FILES_BLOCK = /(?:^|\n\n)((?:!\[[^\]]*\]\(attachment:[^)\s]+\)(?:\n|$))+)$/;

export function splitDescription(desc = "") {
  const files = [...desc.matchAll(TOKEN)].map((m) => ({ name: m[1] || "file", path: m[2] }));
  if (!files.length) return { text: desc, files };
  // The text is kept exactly as typed (spaces and new lines too); only the files block is cut off.
  // Older descriptions with a file line in the middle lose just that line.
  const text = desc.replace(FILES_BLOCK, "").replace(TOKEN, "").replace(/\n{3,}/g, "\n\n");
  return { text, files };
}

/** Text and files back into one description to save. */
export function joinDescription(text, files) {
  if (!files.length) return text;
  const lines = files.map((f) => `![${f.name.replace(/[[\]]/g, "")}](attachment:${f.path})`);
  return (text ? `${text}\n\n` : "") + lines.join("\n");
}

/**
 * Media for a description field: a paperclip button, pasting and dropping files.
 * `value` is the whole saved description; `onChange(newDescription)`.
 * Returns the text for the textarea, the files to show under it, and handlers.
 */
export function useAttachments({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(value); // uploads finish later: add to what's there by then
  latest.current = value;
  const { text, files } = splitDescription(value);

  const setText = (e) => {
    const next = e?.target ? e.target.value : e;
    onChange(joinDescription(next, splitDescription(latest.current).files));
  };
  const remove = (path) => {
    const cur = splitDescription(latest.current);
    onChange(joinDescription(cur.text, cur.files.filter((f) => f.path !== path)));
  };
  const insert = async (list) => {
    list = [...list].filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    setError("");
    try {
      for (const f of list) {
        if (f.size > MAX_BYTES) throw new Error(`${f.name} is over 2 MB`);
        const path = await uploadAttachment(f);
        const cur = splitDescription(latest.current);
        const next = joinDescription(cur.text, [...cur.files, { name: f.name || "file", path }]);
        latest.current = next;
        onChange(next);
      }
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  const takeFiles = (e, list) => {
    const got = [...(list ?? [])];
    if (got.length) {
      e.preventDefault();
      insert(got);
    }
  };
  return {
    busy,
    error,
    text,
    files,
    setText,
    remove,
    insert,
    textareaProps: {
      onPaste: (e) => takeFiles(e, e.clipboardData?.files),
      onDrop: (e) => takeFiles(e, e.dataTransfer?.files),
    },
  };
}

/** The files attached in the editor, as small thumbnails with a remove button. */
export function AttachmentList({ files, onRemove, busy }) {
  const key = files.map((f) => f.path).join("|");
  const [urls, setUrls] = useState(new Map());
  useEffect(() => {
    let live = true;
    if (files.length) attachmentUrls(files.map((f) => f.path)).then((m) => live && setUrls(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!files.length && !busy) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => {
        const url = urls.get(f.path);
        const kind = kindOf(f.name);
        return (
          <div key={f.path} className="group relative size-20 overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-900/5" title={f.name}>
            {url && kind === "image" ? (
              <img src={url} alt={f.name} className="size-full object-cover" />
            ) : url && kind === "video" ? (
              <video src={url} muted className="size-full object-cover" />
            ) : (
              <span className="flex size-full flex-col items-center justify-center gap-1 px-1.5 text-center text-[10px] leading-tight text-stone-500">
                <FileText className="size-5" />
                <span className="line-clamp-2 break-all">{f.name}</span>
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onRemove(f.path);
              }}
              aria-label={`Remove ${f.name}`}
              className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-stone-900/70 text-white opacity-90 transition hover:bg-stone-900"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      {busy && (
        <div className="grid size-20 place-items-center rounded-xl bg-stone-50 ring-1 ring-stone-900/5">
          <Loader2 className="size-5 animate-spin text-stone-400" />
        </div>
      )}
    </div>
  );
}

/** The paperclip button that picks files to attach. */
export function AttachButton({ onFiles, busy, className }) {
  const input = useRef(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title="Attach pictures, videos or files"
        aria-label="Attach media"
        className={cx("grid size-8 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-60", className)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** A description with its attachments shown inline. */
export function RichDescription({ text, className }) {
  const parts = useMemo(() => {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN)) {
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      out.push({ name: m[1] || "file", path: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }, [text]);
  const paths = parts.filter((p) => p.path).map((p) => p.path);
  const key = paths.join("|");
  const [urls, setUrls] = useState(new Map());
  const [loaded, setLoaded] = useState(false); // links fetched: a missing one means you're not allowed to see it
  useEffect(() => {
    let live = true;
    if (paths.length)
      attachmentUrls(paths)
        .then((m) => live && setUrls(m))
        .catch(() => live && setUrls(new Map()))
        .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cx("text-sm whitespace-pre-wrap", className)}>
      {parts.map((p, i) => {
        if (!p.path) return <span key={i}>{p.text.replace(/^\n+|\n+$/g, "")}</span>;
        const url = urls.get(p.path);
        const kind = kindOf(p.name);
        if (!url && !loaded) return <span key={i} className="my-2 block h-24 w-40 animate-pulse rounded-xl bg-stone-100" />;
        // Only the subtask's people (and admins) can open its attachments.
        if (!url)
          return (
            <span key={i} className="my-2 flex w-fit items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-[13px] text-stone-500 ring-1 ring-stone-900/5">
              <Lock className="size-3.5" />
              {p.name} · visible to assignees only
            </span>
          );
        if (kind === "image")
          return (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="my-2 block w-fit">
              <img src={url} alt={p.name} className="max-h-80 max-w-full rounded-xl ring-1 ring-stone-900/5" />
            </a>
          );
        if (kind === "video") return <video key={i} src={url} controls className="my-2 block max-h-80 max-w-full rounded-xl bg-black" />;
        if (kind === "audio") return <audio key={i} src={url} controls className="my-2 block max-w-full" />;
        return (
          <a key={i} href={url} target="_blank" rel="noreferrer" className="my-2 flex w-fit items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-stone-700 ring-1 ring-stone-900/5 hover:bg-stone-100">
            <FileText className="size-4 text-stone-500" />
            {p.name}
          </a>
        );
      })}
    </div>
  );
}
