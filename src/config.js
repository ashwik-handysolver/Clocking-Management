/** Minutes between screenshots for a project that has no interval of its own. */
export const DEFAULT_SNAPSHOT_MINUTES = 2;

/** Allowed range for a project's screenshot interval, in minutes. */
export const MIN_SNAPSHOT_MINUTES = 1;
export const MAX_SNAPSHOT_MINUTES = 60;

/** Screenshot interval for a project (set when creating it, editable later). */
export function snapshotMinutesFor(project) {
  return project?.snapshotIntervalMinutes ?? DEFAULT_SNAPSHOT_MINUTES;
}
