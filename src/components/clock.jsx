import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { snapshotMinutesFor } from "../config";
import { DEVICE_ID, acquireLock, lockHeldElsewhere, lockIsLive, readLock, releaseLock, watchLock } from "../lib/clockLock";
import { startScreenCapture } from "../lib/screenCapture";
import { saveSnapshot } from "../lib/snapshotStore";
import { readBeat, sendBeat } from "../store/db";
import { ancestry, runningEntryOf, uid } from "../store/model";
import { useStore } from "../store/store";
import { useDialogs } from "./dialogs";

/*
 * Clocking in = timer + screen sharing. While clocked in, a screenshot is saved right away
 * and then every N minutes (config.js). If sharing stops for any reason (Stop sharing button,
 * tab closed or reloaded), the timer stops at that moment; screenshots go to the private Supabase bucket.
 * Only one tab can be clocked in at a time: tabs in this browser use lib/clockLock.js, other browsers
 * and devices see the check-ins in Supabase (clock_beats). A server job stops timers that stop checking in.
 */

const BEAT_MS = 30_000; // how often the clocked-in tab checks in
const STALE_MS = 90_000; // no check-in for this long = abandoned (the server job uses 2 minutes)
const ASK_EVERY_MS = 10_000; // how often other tabs/devices look at the latest check-in

const ClockContext = createContext(null);

export function ClockProvider({ children }) {
  const { state, index, actions, me } = useStore();
  const { toast } = useDialogs();
  const running = runningEntryOf(state.entries, me.id);
  const [capturing, setCapturing] = useState(false);
  const [busyElsewhere, setBusyElsewhere] = useState(lockHeldElsewhere);
  const session = useRef(null);
  const shotFor = useRef(null); // entry id that already got its first screenshot
  const latest = useRef();
  latest.current = { running, index, name: me.name };

  const endCapture = useCallback(() => {
    session.current?.stop();
    session.current = null;
    setCapturing(false);
    releaseLock();
  }, []);

  const shoot = useCallback(async () => {
    const { running: entry } = latest.current;
    if (!session.current || !entry) return;
    try {
      const { blob } = await session.current.grab();
      await saveSnapshot({ id: uid("snap"), entryId: entry.id, memberId: entry.memberId, memberName: latest.current.name, takenAt: Date.now(), blob });
    } catch (err) {
      console.warn("Screenshot failed", err);
    }
  }, []);

  // Screenshot now, then on the project's interval. Restarts when switching subtasks or when the interval is edited.
  const project = running ? ancestry(index, running.subtaskId).find((x) => x.type === "project") : null;
  const everyMs = snapshotMinutesFor(project) * 60_000;
  useEffect(() => {
    if (!capturing || !running) return;
    if (shotFor.current !== running.id) {
      shotFor.current = running.id;
      shoot();
    }
    const timer = setInterval(shoot, everyMs);
    return () => clearInterval(timer);
    // Only the entry id matters, not the whole entry object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, running?.id, everyMs, shoot]);

  // Timer stopped some other way (e.g. switched user): stop sharing too.
  useEffect(() => {
    if (capturing && !running) endCapture();
  }, [capturing, running, endCapture]);

  // While this tab is clocked in, check in with Supabase every 30 s. Other devices (and the
  // server's cleanup job) treat a timer without recent check-ins as abandoned.
  useEffect(() => {
    if (!capturing || !running) return;
    const beat = () => sendBeat(me.id, running.id, DEVICE_ID).catch(() => {}); // a missed one is retried next time
    beat();
    const timer = setInterval(beat, BEAT_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, running?.id, me.id]);

  // Is the running timer's screen sharing still alive somewhere? Checked every couple of seconds:
  // - this tab is sharing → fine;
  // - another tab in this browser is sharing (local lock) → busy elsewhere;
  // - another device checked in recently → busy elsewhere;
  // - otherwise it was abandoned (tab reloaded or closed) → stop it at its last check-in.
  const asking = useRef(false);
  const lastAsked = useRef(0);
  useEffect(() => {
    const check = async () => {
      const entry = latest.current.running;
      if (!entry?.screenCapture || session.current) return setBusyElsewhere(lockHeldElsewhere());
      if (lockIsLive()) return setBusyElsewhere(true);
      if (asking.current || Date.now() - lastAsked.current < ASK_EVERY_MS) return;
      asking.current = true;
      lastAsked.current = Date.now();
      try {
        const beat = await readBeat(entry.memberId);
        const now = Date.now();
        const mine = beat?.entryId === entry.id ? beat : null;
        const otherDeviceAlive = mine && mine.deviceId !== DEVICE_ID && now - mine.beatAt < STALE_MS;
        const justStarted = !mine && now - entry.start < STALE_MS; // its first check-in may not be saved yet
        if (otherDeviceAlive || justStarted) return setBusyElsewhere(true);
        if (latest.current.running?.id !== entry.id || session.current) return; // changed while we waited
        const lock = readLock();
        const lastSeen = Math.max(mine?.beatAt ?? 0, lock?.beat ?? 0) || entry.start;
        actions.stopTimer(Math.max(entry.start, Math.min(lastSeen, now)));
        setBusyElsewhere(false);
        toast("Screen sharing ended, so your timer was stopped and time logged");
      } catch {
        /* offline: try again on the next check */
      } finally {
        asking.current = false;
      }
    };
    check();
    return watchLock(check);
  }, [actions, toast]);

  // Re-check straight away when the running timer changes (e.g. started on another device).
  useEffect(() => {
    lastAsked.current = 0;
  }, [running?.id]);
  // Release the lock if this provider unmounts while sharing.
  useEffect(() => () => session.current && endCapture(), [endCapture]);

  // Clocked in from another tab or another device (not this tab).
  const busyRef = useRef(false);
  busyRef.current = busyElsewhere;
  const elsewhere = () => lockHeldElsewhere() || (busyRef.current && !session.current);

  /** Must be called directly from a click (browser rule for the share prompt). Returns true if clocked in. */
  const clockIn = useCallback(
    async (subtaskId) => {
      if (elsewhere()) {
        toast("You're already clocked in from another tab or device");
        return false;
      }
      if (!session.current) {
        try {
          session.current = await startScreenCapture({
            onEnded: () => {
              actions.stopTimer();
              endCapture();
              toast("Screen sharing stopped, so your timer was stopped and time logged");
            },
          });
        } catch {
          toast("Share your screen to clock in");
          return false;
        }
        if (elsewhere()) {
          // Another tab or device clocked in while the prompt was open.
          session.current.stop();
          session.current = null;
          toast("You're already clocked in from another tab or device");
          return false;
        }
        acquireLock();
        setCapturing(true);
      }
      actions.startTimer(subtaskId, { screenCapture: true });
      return true;
    },
    [actions, endCapture, toast],
  );

  const clockOut = useCallback(() => {
    if (elsewhere()) {
      toast("Your timer is running in another tab or device. Stop it there.");
      return false;
    }
    actions.stopTimer();
    endCapture();
    return true;
  }, [actions, endCapture, toast]);

  const value = useMemo(() => ({ clockIn, clockOut, capturing, busyElsewhere }), [clockIn, clockOut, capturing, busyElsewhere]);
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

/** { clockIn(subtaskId), clockOut(), capturing, busyElsewhere } */
export function useClock() {
  return useContext(ClockContext);
}
