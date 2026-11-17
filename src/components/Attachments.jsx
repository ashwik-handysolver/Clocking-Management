import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Lock, Paperclip } from "lucide-react";
import { attachmentUrls, uploadAttachment } from "../store/db";
import { cx } from "./ui";

/*
 * Media in descriptions. An uploaded file is written into the text as one line:
 *   ![photo.png](attachment:<storage path>)
 * so it saves with the description as it is, and the line can be moved or deleted like any text.
 * When the description is shown, those lines become the picture / video / audio / file link.
 */

const TOKEN = /!\[([^\]]*)\]\(attachment:([^)\s]+)\)/g;
const MAX_BYTES = 50 * 1024 * 1024;

const kindOf = (name) => {
  const ext = name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "aac"].includes(ext)) return "audio";
  return "file";
};

const tokenFor = (file, path) => `![${file.name.replace(/[[\]]/g, "")}](attachment:${path})`;

/** Uploads files and returns the text to insert. Throws on a failed upload. */
async function uploadAll(files) {
  const out = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new Error(`${f.name} is over 50 MB`);
    out.push(tokenFor(f, await uploadAttachment(f)));
  }
  return out.join("\n");
}

/**
 * Hooks a description textarea up for media: a paperclip button, pasting and dropping files.
 * `value`/`onChange` follow the textarea (onChange gets an event-like { target: { value } }).
 */
export function useAttachments({ value, onChange, textareaRef }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const insert = async (files) => {
    files = [...files].filter(Boolean);
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      const text = await uploadAll(files);
      const el = textareaRef.current;
      const at = el && document.activeElement === el ? el.selectionEnd : value.length;
      const before = value.slice(0, at);
      const after = value.slice(at);
      const sep = before && !before.endsWith("\n") ? "\n" : "";
      const tail = after && !after.startsWith("\n") ? "\n" : "";
      onChange({ target: { value: before + sep + text + tail + after } });
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    insert,
    textareaProps: {
      onPaste: (e) => {
        const files = [...(e.clipboardData?.files ?? [])];
        if (files.length) {
          e.preventDefault();
          insert(files);
        }
      },
      onDrop: (e) => {
        const files = [...(e.dataTransfer?.files ?? [])];
        if (files.length) {
          e.preventDefault();
          insert(files);
        }
      },
    },
  };
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
        if (!p.path) return <span key={i}>{p.text.replace(/^\n|\n$/g, "")}</span>;
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
