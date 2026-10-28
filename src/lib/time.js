export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n) => String(n).padStart(2, "0");

/** 3725 -> "01:02:05" */
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 12000 -> "3h 20m", 900 -> "15m" */
export function formatHours(seconds) {
  const totalMin = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Compact decimal hours for grids: 5400 -> "1.5" */
export function decimalHours(seconds) {
  if (!seconds) return "";
  const h = seconds / 3600;
  return h < 10 ? h.toFixed(1).replace(/\.0$/, "") : String(Math.round(h));
}

/** Local YYYY-MM-DD for a timestamp or Date. */
export function toDateKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => toDateKey(Date.now());

/** Parse a YYYY-MM-DD key as local midnight. */
export function fromDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function toTimeInput(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combine "YYYY-MM-DD" + "HH:MM" into a timestamp. */
export function combineDateTime(dateKey, time) {
  const [h, m] = time.split(":").map(Number);
  return fromDateKey(dateKey) + h * HOUR + m * MINUTE;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing ts. */
export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function formatDate(value, opts = { day: "numeric", month: "short" }) {
  const ts = typeof value === "string" ? fromDateKey(value) : value;
  return new Date(ts).toLocaleDateString("en-GB", opts);
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatDate(ts);
}

/** Human label + tone for a due date key. */
export function dueInfo(dueKey, done = false) {
  if (!dueKey) return { label: "No due date", tone: "muted", days: null };
  const days = Math.round((fromDateKey(dueKey) - startOfDay(Date.now())) / DAY);
  if (done) return { label: formatDate(dueKey), tone: "muted", days };
  if (days < 0) return { label: `Overdue ${-days}d`, tone: "danger", days };
  if (days === 0) return { label: "Due today", tone: "warning", days };
  if (days === 1) return { label: "Due tomorrow", tone: "warning", days };
  if (days < 7) return { label: `Due in ${days}d`, tone: "default", days };
  return { label: formatDate(dueKey), tone: "default", days };
}

/** "25 Oct 2026" from a YYYY-MM-DD key. */
export const shortDate = (key) => (key ? new Date(fromDateKey(key)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
