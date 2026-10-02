import type { AiHandoverTimeRange } from "@chatbotx.io/database/partials"
import type { AiHandoverSettingsModel } from "@chatbotx.io/database/types"
import { formatInTimeZone } from "date-fns-tz"

/** The settings the active/inactive decision reads (a subset of the row). */
export type AiHandoverActivitySettings = Pick<
  AiHandoverSettingsModel,
  "enabled" | "scheduleEnabled" | "timeRanges"
>

const hourInTimeZone = (now: Date, timeZone: string): number =>
  Number(formatInTimeZone(now, timeZone, "H"))

const isHourInRange = (hour: number, range: AiHandoverTimeRange): boolean => {
  const { from, to } = range
  if (from === to) {
    return false
  }
  // `from > to` wraps past midnight (e.g. 22..6); the end hour is exclusive.
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

/**
 * Whether `now`, read as a whole hour (0..23) in `timeZone`, falls in any of
 * the ranges. Hour granularity and end-exclusive, like v1's run-time window;
 * ranges are OR-ed and an empty list never matches.
 */
export function isWithinHourRanges(
  ranges: AiHandoverTimeRange[],
  timeZone: string,
  now: Date,
): boolean {
  const hour = hourInTimeZone(now, timeZone)
  return ranges.some((range) => isHourInRange(hour, range))
}

/**
 * Whether the AI hand-off is active right now: switched on and, when a
 * schedule is on, inside one of its windows. Pure, so the worker and the
 * builder decide identically.
 */
export function isAiHandoverActive(
  settings: AiHandoverActivitySettings,
  timeZone: string,
  now: Date,
): boolean {
  if (!settings.enabled) {
    return false
  }
  return settings.scheduleEnabled
    ? isWithinHourRanges(settings.timeRanges, timeZone, now)
    : true
}
