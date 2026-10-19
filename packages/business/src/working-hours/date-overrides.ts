import type { WorkingDateOverrides, WorkingDateRanges } from "./duration"

export type DateOverrideRow = {
  /** `null` = workspace-wide holiday. */
  workingHoursId: string | null
  /** Local date, `YYYY-MM-DD`. */
  date: string
  ranges: WorkingDateRanges
}

/**
 * The overrides in force for one schedule: its own rows, falling back to the
 * workspace holidays for a date it does not override (schedule -> holiday ->
 * weekly intervals, the last step being the duration helpers' job).
 */
export function buildDateOverridesForSchedule(
  rows: readonly DateOverrideRow[],
  workingHoursId: string,
): WorkingDateOverrides {
  const merged = new Map<string, WorkingDateRanges>()
  for (const row of rows) {
    if (row.workingHoursId === null) {
      merged.set(row.date, row.ranges)
    }
  }
  for (const row of rows) {
    if (row.workingHoursId === workingHoursId) {
      merged.set(row.date, row.ranges)
    }
  }
  return merged
}
