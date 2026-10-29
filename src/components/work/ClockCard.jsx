import { Camera, CirclePause, Clock, Hourglass, MonitorX, Play, Square, Timer, UserRound } from "lucide-react";
import { snapshotMinutesFor } from "../../config";
import { useNow } from "../../hooks/useNow";
import { openItem } from "../../lib/router";
import { formatClock, formatHours, formatTime } from "../../lib/time";
import { ancestry, entrySeconds, isDone, runningEntryOf, sumSeconds } from "../../store/model";
import { canClockOn, canLogManualTime } from "../../store/permissions";
import { useStore } from "../../store/store";
import { useClock } from "../clock";
import { useDialogs } from "../dialogs";
import { Button, Card, ProgressBar, Watermark, cx } from "../ui";

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
      disabled={busyElsewhere || (!onThis && (done || !allowed))}
      title={busyElsewhere ? "You're clocked in from another tab or device" : onThis ? "Stop timer" : !allowed ? "Only people assigned to this subtask can clock in" : done ? "Subtask is completed" : "Start timer"}
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
        "grid size-9 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-30",
        onThis ? "bg-brand-500 text-white shadow-glow" : "bg-brand-50 text-brand-600 hover:scale-105 hover:bg-brand-500 hover:text-white",
      )}
    >
      {onThis ? <Square className="size-3" fill="currentColor" /> : <Play className="ml-0.5 size-3.5" fill="currentColor" />}
    </button>
  );
}

/** The main clock-in panel on a subtask. */
export default function ClockCard({ subtask }) {
  // `entries` is already limited to the signed-in user's own time (store/permissions.js).
  const { entries: myEntries, index, me } = useStore();
  const { toast, openEntryForm } = useDialogs();
  const { clockIn, clockOut, busyElsewhere } = useClock();
  const project = ancestry(index, subtask.id).find((x) => x.type === "project");
  const everyMin = snapshotMinutesFor(project);
  const everyLabel = everyMin === 1 ? "every minute" : `every ${everyMin} minutes`;

  const entries = myEntries.filter((e) => e.subtaskId === subtask.id);
  const myRunning = runningEntryOf(myEntries, me.id);
  const onThis = myRunning?.subtaskId === subtask.id;
  const elsewhere = myRunning && !onThis ? index.get(myRunning.subtaskId) : null;
  const now = useNow(onThis);

  const allowed = canClockOn(me, subtask); // only assignees can clock in
  // Not on this subtask (any more)? Then none of its time counts as yours.
  const mine = allowed ? sumSeconds(entries, now) : 0;
  const estimateSecs = (subtask.estimate ?? 0) * 3600;
  const pct = estimateSecs ? (mine / estimateSecs) * 100 : 0;
  const done = isDone(subtask);

  const start = async () => {
    if (await clockIn(subtask.id)) toast(elsewhere ? `Switched timer from “${elsewhere.name}”` : "Timer started · screenshots on");
  };
  const stop = () => {
    if (clockOut()) toast("Timer stopped and time logged");
  };

  if (onThis) {
    return (
      <>
      <Card className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-500 to-brand-700 p-6 text-white ring-0 shadow-glow">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border-[28px] border-white/10" />
        <Timer aria-hidden="true" strokeWidth={1.25} className="pointer-events-none absolute -bottom-10 left-1/3 size-48 rotate-[-12deg] text-white/[0.07]" />
        <div className="relative flex flex-col gap-5 @xl:flex-row @xl:items-center">
          <div className="flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/85">
              <span className="size-2 animate-pulse-dot rounded-full bg-surface" />
              You're on the clock · since {formatTime(myRunning.start)}
            </p>
            <p className="mt-1 font-mono text-5xl font-bold tracking-tight tabular-nums @xl:text-6xl">{formatClock(entrySeconds(myRunning, now))}</p>
          </div>
          <button
            type="button"
            onClick={stop}
            disabled={busyElsewhere}
            title={busyElsewhere ? "Stop it from the tab where you clocked in" : undefined}
            className="disabled:cursor-not-allowed disabled:opacity-60 flex h-14 items-center justify-center gap-3 rounded-2xl bg-surface px-7 text-base font-extrabold text-brand-600 shadow-lg transition hover:scale-[1.02] active:scale-100"
          >
            <Square className="size-4" fill="currentColor" /> Stop
          </button>
        </div>
        <div className="relative mt-6 space-y-3">
          <div className="flex justify-between text-xs font-semibold text-white/85">
            <span>{formatHours(mine)} logged by you</span>
            <span>{estimateSecs ? `${Math.round(pct)}% of ${subtask.estimate}h estimate` : "No estimate"}</span>
          </div>
          <ProgressBar value={pct} tone="white" />
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
            {busyElsewhere ? (
              <>
                <MonitorX className="size-3.5" /> Running in another tab or device. Stop it there.
              </>
            ) : (
              <>
                <Camera className="size-3.5" /> A screenshot is taken {everyLabel} while you're clocked in
              </>
            )}
          </p>
        </div>
      </Card>
      </>
    );
  }

  return (
    <>
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-28 -left-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_232_212/0.9),transparent)]" />
      <div className="relative flex flex-col gap-5 p-5 @xl:flex-row @xl:items-center">
        <button
          type="button"
          onClick={start}
          disabled={done || !allowed || busyElsewhere}
          aria-label="Start timer"
          className="group grid size-20 shrink-0 place-items-center self-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:scale-100 @xl:self-auto"
        >
          <Play className="ml-1 size-8" fill="currentColor" />
        </button>
        <div className="min-w-0 flex-1 text-center @xl:text-left">
          <p className="text-lg font-extrabold tracking-tight text-stone-900">
            {busyElsewhere ? "Clocked in from another tab or device" : !allowed ? "Not assigned to you" : done ? "Subtask completed" : elsewhere ? "Switch your timer here" : "Start tracking time"}
          </p>
        </div>
        <div className={cx("grid gap-2", allowed ? "grid-cols-2 @xl:w-72" : "grid-cols-1 @xl:w-36")}>
          {/* Your time: only on subtasks assigned to you */}
          {allowed && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-surface p-3 ring-1 ring-brand-100">
              <Watermark icon={UserRound} tone="brand" className="!-right-2 !-bottom-3 !size-14" />
              <p className="relative flex items-center gap-1.5 text-[11px] font-bold text-stone-400 uppercase">
                <UserRound className="size-3.5 text-brand-500" /> Your time
              </p>
              <p className="relative text-lg font-extrabold text-stone-900">{formatHours(mine)}</p>
            </div>
          )}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 to-surface p-3 ring-1 ring-violet-100">
            <Watermark icon={Hourglass} tone="violet" className="!-right-2 !-bottom-3 !size-14" />
            <p className="relative flex items-center gap-1.5 text-[11px] font-bold text-stone-400 uppercase">
              <Hourglass className="size-3.5 text-violet-500" /> Estimate
            </p>
            <p className="relative text-lg font-extrabold text-stone-900">{subtask.estimate ? `${subtask.estimate}h` : "—"}</p>
          </div>
        </div>
      </div>

      {elsewhere && allowed && (
        <div className="mx-5 mb-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <CirclePause className="size-4 shrink-0" />
          <span>
            Your timer is running on{" "}
            <button type="button" className="font-bold underline" onClick={() => openItem(elsewhere.id)}>
              {elsewhere.name}
            </button>
            .
          </span>
        </div>
      )}

      {(allowed || canLogManualTime(me)) && (
      <div className="space-y-3 border-t border-stone-100 bg-stone-50/50 px-5 py-4">
        {/* Your progress against the estimate: only on subtasks assigned to you */}
        {allowed && (
          <div className="flex items-center gap-3">
            <ProgressBar value={pct} tone={pct > 100 ? "red" : "brand"} className="flex-1" />
            <span className={cx("shrink-0 text-xs font-bold", pct > 100 ? "text-red-600" : "text-stone-500")}>
              {estimateSecs ? `${Math.round(pct)}% of ${subtask.estimate}h` : "No estimate"}
            </span>
          </div>
        )}
        {/* Only the admin logs time by hand, for someone assigned to this subtask. */}
        {canLogManualTime(me) && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" icon={Clock} onClick={() => openEntryForm({ subtaskId: subtask.id, scopeId: subtask.id })}>
              Log time manually
            </Button>
          </div>
        )}
      </div>
      )}
    </Card>
    </>
  );
}
