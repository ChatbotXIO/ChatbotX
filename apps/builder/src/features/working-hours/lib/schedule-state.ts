import {
  WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY,
  WORKING_HOURS_MINUTES_PER_DAY,
  type WorkingHoursIntervalInput,
} from "@chatbotx.io/database/partials"
import { TIME_STEP_MINUTES } from "./time-options"

export type ScheduleInterval = WorkingHoursIntervalInput

/** Monday first (UI order); values are the stored 0=Sunday..6=Saturday. */
export const DISPLAY_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

const DEFAULT_START_MINUTE = 9 * 60
const DEFAULT_END_MINUTE = 17 * 60
const ADDED_INTERVAL_MINUTES = 60
const LAST_START_MINUTE = WORKING_HOURS_MINUTES_PER_DAY - TIME_STEP_MINUTES

export type ScheduleError = "order" | "overlap"

export type IndexedInterval = { index: number; interval: ScheduleInterval }

export function intervalsOfWeekday(
  intervals: readonly ScheduleInterval[],
  weekday: number,
): IndexedInterval[] {
  const rows: IndexedInterval[] = []
  intervals.forEach((interval, index) => {
    if (interval.weekday === weekday) {
      rows.push({ index, interval })
    }
  })
  return rows
}

export function canAddInterval(
  intervals: readonly ScheduleInterval[],
  weekday: number,
): boolean {
  const day = intervalsOfWeekday(intervals, weekday)
  if (day.length >= WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY) {
    return false
  }
  const lastEnd = Math.max(0, ...day.map((row) => row.interval.endMinute))
  return day.length === 0 || lastEnd <= LAST_START_MINUTE
}

/** Turning a day on seeds 09:00-17:00; turning it off drops its intervals. */
export function toggleWeekday(
  intervals: readonly ScheduleInterval[],
  weekday: number,
  enabled: boolean,
): ScheduleInterval[] {
  const hasIntervals = intervalsOfWeekday(intervals, weekday).length > 0
  if (!enabled) {
    return intervals.filter((interval) => interval.weekday !== weekday)
  }
  if (hasIntervals) {
    return [...intervals]
  }
  return [
    ...intervals,
    {
      weekday,
      startMinute: DEFAULT_START_MINUTE,
      endMinute: DEFAULT_END_MINUTE,
    },
  ]
}

/** Appends a one-hour range after the day's last range (max 10 per day). */
export function addInterval(
  intervals: readonly ScheduleInterval[],
  weekday: number,
): ScheduleInterval[] {
  if (!canAddInterval(intervals, weekday)) {
    return [...intervals]
  }
  const day = intervalsOfWeekday(intervals, weekday)
  if (day.length === 0) {
    return toggleWeekday(intervals, weekday, true)
  }
  const startMinute = Math.max(...day.map((row) => row.interval.endMinute))
  return [
    ...intervals,
    {
      weekday,
      startMinute,
      endMinute: Math.min(
        startMinute + ADDED_INTERVAL_MINUTES,
        WORKING_HOURS_MINUTES_PER_DAY,
      ),
    },
  ]
}

export function removeIntervalAt(
  intervals: readonly ScheduleInterval[],
  index: number,
): ScheduleInterval[] {
  return intervals.filter((_, position) => position !== index)
}

export function setIntervalBoundary(
  intervals: readonly ScheduleInterval[],
  index: number,
  boundary: "startMinute" | "endMinute",
  minute: number,
): ScheduleInterval[] {
  return intervals.map((interval, position) =>
    position === index ? { ...interval, [boundary]: minute } : interval,
  )
}

export function sortIntervals(
  intervals: readonly ScheduleInterval[],
): ScheduleInterval[] {
  return [...intervals].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  )
}

/**
 * Per-weekday blocking problems: a range whose end is not after its start
 * ("order"), otherwise two ranges that overlap ("overlap"). Weekdays without
 * a problem are absent from the result.
 */
export function validateSchedule(
  intervals: readonly ScheduleInterval[],
): Map<number, ScheduleError> {
  const errors = new Map<number, ScheduleError>()
  for (const weekday of DISPLAY_WEEKDAYS) {
    const day = intervalsOfWeekday(intervals, weekday).map(
      (row) => row.interval,
    )
    if (day.some((interval) => interval.endMinute <= interval.startMinute)) {
      errors.set(weekday, "order")
      continue
    }
    let furthestEnd = 0
    let overlaps = false
    for (const interval of sortIntervals(day)) {
      if (interval.startMinute < furthestEnd) {
        overlaps = true
        break
      }
      furthestEnd = Math.max(furthestEnd, interval.endMinute)
    }
    if (overlaps) {
      errors.set(weekday, "overlap")
    }
  }
  return errors
}
