import { fromDateKey, toDateKey } from "../lib/time";
import { addMonthsKey, dayBefore, entryBilling, workingDays } from "./model";

/*
 * Numbers behind the Client hours card, for one client's current billing cycle.
 * Only billable time counts toward the client's hours; non-billable is reported separately.
 * Working days are Monday–Friday minus holidays.
 */

const dayStart = (key) => fromDateKey(key);
const dayEnd = (key) => {
  const d = new Date(fromDateKey(key));
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

/** Seconds of `entries` inside [from, to), clipping entries that cross the edges. */
function secondsIn(entries, from, to, now) {
  let total = 0;
  for (const e of entries) {
    const start = Math.max(e.start, from);
    const end = Math.min(e.end ?? now, to);
    if (end > start) total += (end - start) / 1000;
  }
  return total;
}

/**
 * @param cycle    clientCycle(client, today)
 * @param entries  clockings on this client's work (any billing)
 * @param index    item index (to read each clocking's billing category)
 * @param holidays Set of "YYYY-MM-DD"
 */
export function cycleStats({ cycle, entries, index, holidays = new Set(), now = Date.now(), today }) {
  const budget = cycle.hours * 3600;
  const billable = entries.filter((e) => entryBilling(index, e) === "billable");
  const nonBillable = entries.filter((e) => entryBilling(index, e) !== "billable");
  const [cStart, cEnd, tStart, tEnd] = [dayStart(cycle.start), dayEnd(cycle.end), dayStart(today), dayEnd(today)];

  const used = secondsIn(billable, cStart, cEnd, now);
  const nonBillableUsed = secondsIn(nonBillable, cStart, cEnd, now);
  const usedBeforeToday = cycle.upcoming ? 0 : secondsIn(billable, cStart, Math.min(tStart, cEnd), now);
  const todayUsed = cycle.upcoming ? 0 : secondsIn(billable, tStart, tEnd, now);

  const totalDays = workingDays(cycle.start, cycle.end, holidays);
  const elapsedDays = cycle.upcoming || today <= cycle.start ? 0 : workingDays(cycle.start, dayBefore(today), holidays);
  const daysLeft = cycle.upcoming ? totalDays : workingDays(today, cycle.end, holidays);
  const todayIsWorkday = !cycle.upcoming && workingDays(today, today, holidays) === 1;

  // Pace: where billable hours should be by the end of yesterday if spread evenly over working days.
  const expected = totalDays ? (budget * elapsedDays) / totalDays : 0;
  const pace = usedBeforeToday - expected;
  const left = Math.max(0, budget - used);
  const neededPerDay = daysLeft ? Math.max(0, budget - usedBeforeToday) / daysLeft : 0;

  const tolerance = Math.max(3600, budget * 0.05);
  const status = used > budget ? "over" : cycle.upcoming ? "upcoming" : pace < -tolerance ? "behind" : pace > tolerance ? "ahead" : "on-track";
  const endingSoon = !cycle.upcoming && daysLeft <= 3;

  const byMember = new Map();
  for (const e of billable) {
    const s = secondsIn([e], cStart, cEnd, now);
    if (s > 0) byMember.set(e.memberId, (byMember.get(e.memberId) ?? 0) + s);
  }

  const prevUsed = cycle.prev ? secondsIn(billable, dayStart(cycle.prev.start), dayEnd(cycle.prev.end), now) : null;

  return {
    budget, used, nonBillableUsed, left, pct: budget ? (used / budget) * 100 : 0,
    totalDays, elapsedDays, daysLeft, todayIsWorkday, todayUsed,
    expected, pace, neededPerDay, neededPerWeek: Math.min(left, neededPerDay * 5),
    status, endingSoon, byMember, prevUsed,
  };
}

/**
 * Billable hours in each of a client's billing cycles, oldest first, up to and including the current one
 * (at most `max`). `entries` are clockings on this client's work.
 * Each row: { start, end, seconds, nonBillable, current, upcoming }.
 */
export function cycleHistory({ client, entries, index, now = Date.now(), today, max = 12 }) {
  if (!client?.budgetHours) return [];
  const months = client.cycleMonths || 1;
  const first = client.cycleStart || toDateKey(client.createdAt ?? now);
  const billable = entries.filter((e) => entryBilling(index, e) === "billable");
  const other = entries.filter((e) => entryBilling(index, e) !== "billable");
  const rows = [];
  for (let k = 0; ; k++) {
    const start = addMonthsKey(first, k * months);
    if (k > 0 && start > today) break;
    const end = dayBefore(addMonthsKey(first, (k + 1) * months));
    const [from, to] = [dayStart(start), dayEnd(end)];
    rows.push({
      start,
      end,
      seconds: secondsIn(billable, from, to, now),
      nonBillable: secondsIn(other, from, to, now),
      current: start <= today && today <= end,
      upcoming: start > today,
    });
    if (start > today) break; // first cycle hasn't started yet
  }
  return rows.slice(-max);
}

/** Most urgent first: over, behind, ending soon, on track, ahead, upcoming. */
const RANK = { over: 0, behind: 1, "on-track": 3, ahead: 4, upcoming: 5 };
export const byUrgency = (a, b) =>
  (a.stats.endingSoon && a.stats.status === "on-track" ? 2 : RANK[a.stats.status]) -
    (b.stats.endingSoon && b.stats.status === "on-track" ? 2 : RANK[b.stats.status]) || a.stats.pace - b.stats.pace;
