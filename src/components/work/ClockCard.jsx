import { CirclePause, Clock, Play, Square } from "lucide-react";
import { snapshotMinutesFor } from "../../config";
import { useNow } from "../../hooks/useNow";
import { openItem } from "../../lib/router";
import { formatClock, formatHours, formatTime } from "../../lib/time";
import { ancestry, entrySeconds, isDone, runningEntryOf, sumSeconds } from "../../store/model";
import { canClockOn, canLogManualTime } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useClock } from "../clock";
import { useDialogs } from "../dialogs";
import { Button, cx } from "../ui";

/** Compact play/stop toggle for the current user on one subtask (used in lists). */
export function ClockButton({ subtask }) {
  const { entries, me } = useStore();
  const { toast } = useDialogs();
  const { clockIn, clockOut, busyElsewhere } = useClock();
  const running = runningEntryOf(entries, me.id);
  const onThis = running?.subtaskId === subtask.id;
  const done = isDone(subtask);
  const allowed = canClockOn(me, subtask); // only assignees can start a timer

  return (
    <button
      type="button"
      disabled={!onThis && (busyElsewhere || done || !allowed)}
      title={onThis ? "Stop timer" : busyElsewhere ? "You're clocked in from another tab or device" : !allowed ? "Only people assigned to this subtask can clock in" : done ? "Subtask is completed" : "Start timer"}
      aria-label={onThis ? `Stop timer on ${subtask.name}` : `Start timer on ${subtask.name}`}
      onClick={async (e) => {
        e.stopPropagation();
        if (onThis) {
          if (clockOut()) toast("Timer stopped and time logged");
        } else if (await clockIn(subtask.id)) {
          toast(running ? `Switched timer to “${subtask.name}”` : "Timer started · screenshots on");
        }
      }}
      className={cx(
        "grid size-9 shrink-0 place-items-center rounded-full transition duration-200 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-30",
        onThis
          ? "bg-brand-500 text-white hover:scale-105 hover:shadow-[0_0_0_5px_rgb(255_107_26/0.18)]"
          : "bg-brand-50 text-brand-600 hover:scale-105 hover:bg-brand-500 hover:text-white hover:shadow-[0_0_0_5px_rgb(255_107_26/0.14)]",
      )}
    >
      {/* Keyed so the icon spins in whenever it switches between play and stop */}
      {onThis ? (
        <Square key="stop" className="size-3 animate-icon-swap" fill="currentColor" />
      ) : (
        <Play key="play" className="ml-0.5 size-3.5 animate-icon-swap" fill="currentColor" />
      )}
    </button>
  );
}

/**
 * The clock inside an expanded subtask: one compact bar.
 * Clocked in here: the running time and Stop. Otherwise: Start, with your time so far.
 */
export default function ClockCard({ subtask }) {
  // `entries` is already limited to the signed-in user's own time (store/permissions.js).
  const { entries: myEntries, index, me } = useStore();
  const { toast, openEntryForm } = useDialogs();
  const { clockIn, clockOut, busyElsewhere } = useClock();
  const project = ancestry(index, subtask.id).find((x) => x.type === "project");
  const everyMin = snapshotMinutesFor(project);
  const everyLabel = everyMin === 1 ? "every minute" : `every ${everyMin} min`;

  const entries = myEntries.filter((e) => e.subtaskId === subtask.id);
  const myRunning = runningEntryOf(myEntries, me.id);
  const onThis = myRunning?.subtaskId === subtask.id;
  const elsewhere = myRunning && !onThis ? index.get(myRunning.subtaskId) : null;
  const now = useNow(onThis);

  const allowed = canClockOn(me, subtask); // only assignees can clock in
  // Not on this subtask (any more)? Then none of its time counts as yours.
  const mine = allowed ? sumSeconds(entries, now) : 0;
  const done = isDone(subtask);

  const start = async () => {
    if (await clockIn(subtask.id)) toast(elsewhere ? `Switched timer from “${elsewhere.name}”` : "Timer started · screenshots on");
  };
  const stop = () => {
    if (clockOut()) toast("Timer stopped and time logged");
  };

  if (onThis) {
    return (
      <div className="palette-fixed flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-brand-500 px-3 py-2 text-white">
        <button
          type="button"
          onClick={stop}
          title={busyElsewhere ? "Stop timer (running in another tab or device)" : "Stop timer"}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface px-3 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-50"
        >
          <Square className="size-3" fill="currentColor" /> Stop
        </button>
        <span className="font-mono text-lg font-bold tabular-nums">{formatClock(entrySeconds(myRunning, now))}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-white/85">
          <span className="size-1.5 shrink-0 animate-pulse-dot rounded-full bg-white" />
          <span className="truncate">
            Since {formatTime(myRunning.start)} · {busyElsewhere ? "screen sharing runs in another tab" : `screenshot ${everyLabel}`}
          </span>
        </span>
        <span className="text-xs font-semibold text-white/85 tabular-nums">
          {formatHours(mine)}
        </span>
      </div>
    );
  }

  const label = busyElsewhere ? "Clocked in from another tab or device" : !allowed ? "Not assigned to you" : done ? "Subtask completed" : elsewhere ? "Switch your timer here" : "Start timer";

  return (
    <div className="rounded-xl ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <button
          type="button"
          onClick={start}
          disabled={done || !allowed || busyElsewhere}
          aria-label="Start timer"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="ml-0.5 size-3.5" fill="currentColor" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{label}</span>
        {allowed && (
          <span className="flex items-center gap-2 text-xs text-stone-500 tabular-nums">
            <span>
              <span className="font-semibold text-stone-900">{formatHours(mine)}</span>
              {" logged"}
            </span>
          </span>
        )}
        {canLogManualTime(me) && (
          <Button variant="ghost" size="xs" icon={Clock} onClick={() => openEntryForm({ subtaskId: subtask.id, scopeId: subtask.id })}>
            Log time
          </Button>
        )}
      </div>
      {elsewhere && allowed && (
        <p className="flex items-center gap-1.5 border-t border-stone-100 px-3 py-1.5 text-xs text-amber-800">
          <CirclePause className="size-3.5 shrink-0" />
          Your timer is running on
          <button type="button" className="truncate font-semibold underline" onClick={() => openItem(elsewhere.id)}>
            {elsewhere.name}
          </button>
        </p>
      )}
    </div>
  );
}
