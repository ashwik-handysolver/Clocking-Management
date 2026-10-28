import { useState } from "react";
import { CalendarOff, Plus, Trash } from "lucide-react";
import { shortDate, todayKey } from "../../lib/time";
import { deleteHoliday, saveHoliday } from "../../store/db";
import { useStore } from "../../store/store";
import { Button, Field, Modal, cx, inputClass } from "../ui";

/** Admin: days off that don't count as working days in client billing cycles. */
export default function HolidaysDialog({ onClose }) {
  const { state } = useStore();
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = todayKey();
  const list = [...(state.holidays ?? [])].sort((a, b) => a.day.localeCompare(b.day));
  const upcoming = list.filter((h) => h.day >= today);
  const past = list.filter((h) => h.day < today);

  // Saved straight to Supabase; the list refreshes through Realtime.
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };
  const add = (e) => {
    e.preventDefault();
    if (!day) return setError("Pick a date");
    run(async () => {
      await saveHoliday(day, name.trim());
      setDay("");
      setName("");
    });
  };

  const Row = ({ h }) => (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-stone-50">
      <span className="w-28 shrink-0 text-sm font-bold text-stone-800 tabular-nums">{shortDate(h.day)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-stone-600">{h.name || "Holiday"}</span>
      <Button size="xs" variant="dangerGhost" iconOnly icon={Trash} aria-label={`Remove ${shortDate(h.day)}`} disabled={busy} onClick={() => run(() => deleteHoliday(h.day))} />
    </li>
  );

  return (
    <Modal title="Holidays" icon={CalendarOff} onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <form onSubmit={add} className="grid grid-cols-[1fr_1.4fr_auto] items-end gap-2">
        <Field label="Date" required>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" className={inputClass} />
        </Field>
        <Button type="submit" variant="primary" icon={Plus} disabled={busy} className="h-10">
          Add
        </Button>
      </form>
      {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-3">
        {!list.length && <p className="py-4 text-center text-sm text-stone-400">No holidays added</p>}
        {upcoming.length > 0 && (
          <section>
            <h3 className="px-3 pb-1 text-[11px] font-bold tracking-widest text-stone-400 uppercase">Upcoming</h3>
            <ul>{upcoming.map((h) => <Row key={h.day} h={h} />)}</ul>
          </section>
        )}
        {past.length > 0 && (
          <section className={cx(upcoming.length && "border-t border-stone-100 pt-3")}>
            <h3 className="px-3 pb-1 text-[11px] font-bold tracking-widest text-stone-400 uppercase">Past</h3>
            <ul>{past.slice(-10).reverse().map((h) => <Row key={h.day} h={h} />)}</ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
