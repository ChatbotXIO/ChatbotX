import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns"
import { z } from "zod"

/**
 * Relative date choices of the board filter. A preset is stored by key (not as
 * dates), so a saved filter keeps meaning "the last 7 days" whenever it is reopened.
 * `custom` marks a hand-picked from/to range.
 */
export const datePresets = z.enum([
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "last7",
  "last14",
  "last30",
  "thisYear",
  "lastYear",
  "tomorrow",
  "next7",
  "next14",
  "next30",
  "custom",
])
export type DatePreset = z.infer<typeof datePresets>

/** Presets that resolve to a range (everything but `custom`). */
export type ResolvablePreset = Exclude<DatePreset, "custom">

/** Presets looking forward, offered on the due date only. */
export const FUTURE_PRESETS = [
  "tomorrow",
  "next7",
  "next14",
  "next30",
] as const satisfies readonly ResolvablePreset[]

/** Presets looking back (or at the current period), offered on every date row. */
export const PAST_PRESETS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "last7",
  "last14",
  "last30",
  "thisYear",
  "lastYear",
] as const satisfies readonly ResolvablePreset[]

const WEEK_OPTIONS = { weekStartsOn: 1 } as const
const LAST_7_DAYS = 6
const LAST_14_DAYS = 13
const LAST_30_DAYS = 29
const NEXT_7_DAYS = 7
const NEXT_14_DAYS = 14
const NEXT_30_DAYS = 30

/**
 * The concrete range of a preset as of `now`, on the runtime's local calendar
 * days (weeks start on Monday). Bounds sit on day edges, so the result is
 * stable for the whole day.
 */
export function resolveDatePreset(
  preset: ResolvablePreset,
  now: Date,
): { from: Date; to: Date } {
  const dayStart = startOfDay(now)
  const dayEnd = endOfDay(now)
  const backFrom = (days: number) => ({
    from: startOfDay(subDays(now, days)),
    to: dayEnd,
  })
  const forwardTo = (days: number) => ({
    from: dayStart,
    to: endOfDay(addDays(now, days)),
  })
  switch (preset) {
    case "today":
      return { from: dayStart, to: dayEnd }
    case "yesterday":
      return {
        from: startOfDay(subDays(now, 1)),
        to: endOfDay(subDays(now, 1)),
      }
    case "tomorrow":
      return {
        from: startOfDay(addDays(now, 1)),
        to: endOfDay(addDays(now, 1)),
      }
    case "thisWeek":
      return {
        from: startOfWeek(now, WEEK_OPTIONS),
        to: endOfWeek(now, WEEK_OPTIONS),
      }
    case "lastWeek": {
      const previous = subDays(now, 7)
      return {
        from: startOfWeek(previous, WEEK_OPTIONS),
        to: endOfWeek(previous, WEEK_OPTIONS),
      }
    }
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case "lastMonth": {
      const previous = subMonths(now, 1)
      return { from: startOfMonth(previous), to: endOfMonth(previous) }
    }
    case "last7":
      return backFrom(LAST_7_DAYS)
    case "last14":
      return backFrom(LAST_14_DAYS)
    case "last30":
      return backFrom(LAST_30_DAYS)
    case "thisYear":
      return { from: startOfYear(now), to: endOfYear(now) }
    case "lastYear": {
      const previous = subYears(now, 1)
      return { from: startOfYear(previous), to: endOfYear(previous) }
    }
    case "next7":
      return forwardTo(NEXT_7_DAYS)
    case "next14":
      return forwardTo(NEXT_14_DAYS)
    case "next30":
      return forwardTo(NEXT_30_DAYS)
    default:
      return preset satisfies never
  }
}
