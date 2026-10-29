import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CircleAlert, CircleCheck, X } from "lucide-react";
import EntryForm from "./EntryForm";
import ItemForm from "./ItemForm";
import { Button, Modal } from "./ui";

const DialogsContext = createContext(null);

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-stone-600">{message}</div>
    </Modal>
  );
}

function Toasts({ toasts, dismiss }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end">
      {toasts.map((t) =>
        t.tone === "notify" ? (
          // Notification toast: title, detail, an action and a close button.
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 palette-fixed rounded-2xl bg-stone-900 p-3.5 text-white shadow-float ring-1 ring-white/10">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500">
              <Bell className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t.text}</p>
              {t.detail && <p className="mt-0.5 truncate text-xs text-white/60">{t.detail}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold hover:bg-white/20"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div key={t.id} className="flex animate-toast-in items-center gap-2.5 palette-fixed rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-float">
            {t.tone === "error" ? <CircleAlert className="size-4 shrink-0 text-red-400" /> : <CircleCheck className="size-4 shrink-0 text-brand-400" />}
            {t.text}
          </div>
        ),
      )}
    </div>
  );
}

/** Hosts app-wide modals and toasts; anything can open them via useDialogs(). */
export function DialogsProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);

  const close = useCallback(() => setDialog(null), []);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  /**
   * toast("Saved")                      — short confirmation
   * toast("Couldn't save", "error")     — longer, red icon
   * toast(title, "notify", { detail, action: { label, onClick } }) — notification with a button; stays 8s
   */
  const toast = useCallback(
    (text, tone = "ok", extra = {}) => {
      const id = ++toastSeq.current;
      setToasts((t) => [...t.slice(-3), { id, text, tone, ...extra }]);
      setTimeout(() => dismiss(id), tone === "notify" ? 8000 : tone === "error" ? 6000 : 2800);
    },
    [dismiss],
  );

  // A change the database refused (or couldn't reach): say so, since the screen reverts to what's saved.
  useEffect(() => {
    const onFail = (e) => toast(`Couldn't save that change${e.detail ? `: ${e.detail}` : ""}. Showing what's saved.`, "error");
    window.addEventListener("store:save-failed", onFail);
    return () => window.removeEventListener("store:save-failed", onFail);
  }, [toast]);

  const api = useMemo(
    () => ({
      toast,
      openItemForm: (props) => setDialog({ kind: "item", props }),
      openEntryForm: (props) => setDialog({ kind: "entry", props }),
      confirm: (props) => setDialog({ kind: "confirm", props }),
    }),
    [toast],
  );

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {dialog?.kind === "item" && <ItemForm {...dialog.props} onClose={close} toast={toast} />}
      {dialog?.kind === "entry" && <EntryForm {...dialog.props} onClose={close} toast={toast} />}
      {dialog?.kind === "confirm" && <ConfirmDialog {...dialog.props} onClose={close} />}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </DialogsContext.Provider>
  );
}

export function useDialogs() {
  return useContext(DialogsContext);
}
