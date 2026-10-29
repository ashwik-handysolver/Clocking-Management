import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { snapshotMinutesFor } from "../config";
import { DEVICE_ID, acquireLock, lockHeldElsewhere, lockIsLive, readLock, releaseLock, watchLock } from "../lib/clockLock";
import { startScreenCapture } from "../lib/screenCapture";
import { flushSnapshots, saveOrQueueSnapshot } from "../lib/snapshotStore";
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
  // The clocking THIS tab started. Screenshots and check-ins are only ever for it: if the same
  // account clocks in somewhere else, that new clocking is not this screen's to capture.
  const ownEntry = useRef(null); // entry id, "pending" while clocking in, or null
  const latest = useRef();
  latest.current = { running, index, name: me.name };

  const endCapture = useCallback(() => {
    session.current?.stop();
    session.current = null;
    ownEntry.current = null;
    setCapturing(false);
    releaseLock();
  }, []);

  const shoot = useCallback(async () => {
    const { running: entry } = latest.current;
    if (!session.current || !entry || entry.id !== ownEntry.current) return; // not this tab's clocking
    try {
      const { blob } = await session.current.grab();
      // Offline: kept and uploaded when the connection is back.
      await saveOrQueueSnapshot({ id: uid("snap"), entryId: entry.id, memberId: entry.memberId, memberName: latest.current.name, takenAt: Date.now(), blob });
    } catch (err) {
      console.warn("Screenshot not uploaded yet", err);
    }
  }, []);

  // Screenshot now, then on the project's interval. Restarts when switching subtasks or when the interval is edited.
  const project = running ? ancestry(index, running.subtaskId).find((x) => x.type === "project") : null;
  const everyMs = snapshotMinutesFor(project) * 60_000;
  useEffect(() => {
    if (!capturing || !running || running.id !== ownEntry.current) return;
    if (shotFor.current !== running.id) {
      shotFor.current = running.id;
      shoot();
    }
    const timer = setInterval(shoot, everyMs);
    return () => clearInterval(timer);
    // Only the entry id matters, not the whole entry object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, running?.id, everyMs, shoot]);

  // Connection trouble: when check-ins last failed (or the browser went offline). Used to tell an
  // outage apart from a deliberate stop.
  const netTroubleAt = useRef(0);
  const lastSubtask = useRef(null); // the subtask this tab's clocking is on
  if (running && running.id === ownEntry.current) lastSubtask.current = running.subtaskId;
  useEffect(() => {
    const onOffline = () => (netTroubleAt.current = Date.now());
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);

  // The timer stopped while this tab is still sharing its screen.
  // - After a connection drop: the server stopped it at the last check-in (it can't tell an outage from a
  //   closed tab). Start a new clocking on the same subtask with the same screen share, and say so;
  //   the offline gap isn't counted, since nothing checked in during it.
  // - Otherwise (e.g. the admin stopped it): stop sharing too.
  useEffect(() => {
    if (!capturing || running || ownEntry.current === "pending") return;
    const outage = Date.now() - netTroubleAt.current < 15 * 60_000;
    const subtaskId = lastSubtask.current;
    if (outage && session.current && subtaskId && latest.current.index.get(subtaskId) && navigator.onLine) {
      netTroubleAt.current = 0;
      ownEntry.current = actions.startTimer(subtaskId, { screenCapture: true }) ?? null;
      toast("Your connection dropped, so the time you were offline wasn't counted. Your timer has started again.");
      return;
    }
    endCapture();
    toast("Your timer was stopped elsewhere, so screen sharing here stopped");
  }, [capturing, running, endCapture, actions, toast]);

  // The account clocked in on another device (or tab), replacing this tab's clocking: stop sharing here.
  useEffect(() => {
    const own = ownEntry.current;
    if (capturing && running && own && own !== "pending" && running.id !== own) {
      endCapture();
      toast("Your timer was started on another device, so screen sharing here stopped");
    }
  }, [capturing, running, endCapture, toast]);

  // While this tab is clocked in, check in with Supabase every 30 s. Other devices (and the
  // server's cleanup job) treat a timer without recent check-ins as abandoned.
  useEffect(() => {
    if (!capturing || !running || running.id !== ownEntry.current) return;
    // A missed check-in is retried next time (and marks connection trouble). A good one also
    // uploads any screenshots that were kept while offline.
    const beat = () =>
      sendBeat(me.id, running.id, DEVICE_ID)
        .then(() => flushSnapshots())
        .catch(() => (netTroubleAt.current = Date.now()));
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
      if (!entry?.screenCapture || (session.current && entry.id === ownEntry.current)) return setBusyElsewhere(lockHeldElsewhere());
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
              // Only stop the timer if it's still this tab's clocking (not one started on another device).
              const mine = latest.current.running && latest.current.running.id === ownEntry.current;
              if (mine) actions.stopTimer();
              endCapture();
              if (mine) toast("Screen sharing stopped, so your timer was stopped and time logged");
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
        ownEntry.current = "pending";
        setCapturing(true);
      }
      ownEntry.current = actions.startTimer(subtaskId, { screenCapture: true }) ?? null;
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
