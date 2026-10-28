import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
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
      <p className="text-sm leading-relaxed text-stone-600">{message}</p>
    </Modal>
  );
}

function Toasts({ toasts }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end">
      {toasts.map((t) => (
        <div key={t.id} className="flex animate-pop items-center gap-2.5 palette-fixed rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-float">
          {t.tone === "error" ? <CircleAlert className="size-4 shrink-0 text-red-400" /> : <CircleCheck className="size-4 shrink-0 text-brand-400" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Hosts app-wide modals and toasts; anything can open them via useDialogs(). */
export function DialogsProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);

  const close = useCallback(() => setDialog(null), []);
  const toast = useCallback((text, tone = "ok") => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 2800);
  }, []);

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
      <Toasts toasts={toasts} />
    </DialogsContext.Provider>
  );
}

export function useDialogs() {
  return useContext(DialogsContext);
}
