/*
 * Only one browser tab may be clocked in at a time (within this browser; other devices are
 * detected through check-ins in Supabase, see components/clock.jsx).
 * The tab that owns the clock writes a heartbeat to localStorage every few seconds;
 * other tabs treat the clock as busy while that heartbeat is fresh.
 * If the owner tab closes, reloads or crashes, the heartbeat stops and the lock frees up.
 */

const KEY = "handysolver-clock-lock";
const BEAT_MS = 3000;
const STALE_MS = 10000;

export const TAB_ID = Math.random().toString(36).slice(2);

/** Identifies this browser (shared by its tabs), so check-ins from here can be told apart from other devices. */
export const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem("handysolver-device");
    if (!id) localStorage.setItem("handysolver-device", (id = Math.random().toString(36).slice(2)));
    return id;
  } catch {
    return TAB_ID;
  }
})();

let beatTimer = null;

export function readLock() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function write(lock) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lock));
  } catch {
    /* storage blocked: the lock just won't work across tabs */
  }
}

const isLive = (lock) => !!lock && !lock.released && Date.now() - lock.beat < STALE_MS;

export const lockIsLive = () => isLive(readLock());
export const lockHeldElsewhere = () => {
  const lock = readLock();
  return isLive(lock) && lock.tabId !== TAB_ID;
};

function onPageHide() {
  releaseLock();
}

export function acquireLock() {
  write({ tabId: TAB_ID, beat: Date.now() });
  clearInterval(beatTimer);
  beatTimer = setInterval(() => write({ tabId: TAB_ID, beat: Date.now() }), BEAT_MS);
  window.addEventListener("pagehide", onPageHide);
}

/** Marks the lock released; `beat` keeps the moment this tab stopped clocking. */
export function releaseLock() {
  clearInterval(beatTimer);
  beatTimer = null;
  window.removeEventListener("pagehide", onPageHide);
  const lock = readLock();
  if (lock?.tabId === TAB_ID) write({ tabId: TAB_ID, beat: Date.now(), released: true });
}

/** Calls `fn` when the lock changes in another tab, and every couple of seconds (to notice stale locks). */
export function watchLock(fn) {
  const onStorage = (e) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  const timer = setInterval(fn, 2000);
  return () => {
    window.removeEventListener("storage", onStorage);
    clearInterval(timer);
  };
}
