import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Trash } from "lucide-react";
import { formatDate } from "../../lib/time";
import { grantClientAccess, listClientAccess, revokeClientAccess } from "../../store/db";
import { useDialogs } from "../dialogs";
import { Button, Field, Modal, inputClass } from "../ui";

/*
 * Admin: who from a client may sign in to the view-only client portal. Each email signs up on the normal
 * sign-in page; the database recognises it and opens the portal instead of the team app.
 */
export default function ClientAccessDialog({ client, onClose }) {
  const { confirm, toast } = useDialogs();
  const [people, setPeople] = useState(null); // null = loading
  const [email, setEmail] = useState(client.contactEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const appUrl = window.location.origin;

  const load = useCallback(async () => {
    try {
      setPeople(await listClientAccess(client.id));
    } catch (err) {
      setError(err.message ?? String(err));
      setPeople([]);
    }
  }, [client.id]);
  useEffect(() => {
    load();
  }, [load]);

  const give = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      await grantClientAccess(client.id, email);
      toast(`${email.trim().toLowerCase()} can now sign in`);
      setEmail("");
      await load();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = (p) =>
    confirm({
      title: "Remove access?",
      message: `${p.email} won't be able to sign in to ${client.name} any more.${p.signedUp ? " Their sign-in is deleted." : ""}`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => {
        try {
          await revokeClientAccess(p.id);
          toast("Access removed");
          await load();
        } catch (err) {
          setError(err.message ?? String(err));
        }
      },
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      toast("Link copied");
    } catch {
      /* the link is on screen to copy by hand */
    }
  };

  return (
    <Modal title="Client access" subtitle={`${client.name} · view only`} icon={KeyRound} onClose={onClose}>
      <div className="space-y-4">
        <form onSubmit={give} className="flex items-end gap-2">
          <Field label="Email" className="min-w-0 flex-1">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@client.com" className={inputClass} data-autofocus />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !email.trim()}>
            {busy ? "Adding…" : "Give access"}
          </Button>
        </form>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex items-center gap-2 rounded-2xl bg-stone-50 px-3 py-2.5 text-xs text-stone-600 ring-1 ring-stone-900/5">
          <span className="min-w-0 flex-1">
            They sign up at <span className="font-bold text-stone-800">{appUrl}</span> with that email.
          </span>
          <Button size="xs" variant="ghost" icon={Copy} onClick={copyLink}>
            Copy
          </Button>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-stone-600">People with access</p>
          {people === null ? (
            <p className="animate-skeleton py-3 text-sm text-stone-400">Loading…</p>
          ) : !people.length ? (
            <p className="py-3 text-sm text-stone-400">Nobody yet</p>
          ) : (
            <ul className="space-y-1.5">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-stone-800">{p.email}</span>
                    <span className="block text-xs text-stone-400">
                      {p.signedUp ? "Signed up" : "Hasn't signed up yet"} · added {formatDate(p.createdAt)}
                    </span>
                  </span>
                  <Button size="xs" variant="dangerGhost" iconOnly icon={Trash} aria-label={`Remove ${p.email}`} title="Remove access" onClick={() => remove(p)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
