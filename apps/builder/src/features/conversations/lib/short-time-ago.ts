const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const DAYS_PER_MONTH = 30
const DAYS_PER_YEAR = 365
const MAX_MONTHS = 11

export type ShortTimeUnit = "now" | "minute" | "hour" | "day" | "month" | "year"

export type ShortTimeAgo = { unit: ShortTimeUnit; count: number }

/**
 * Buckets how long ago `at` was for the conversation list's compact
 * timestamp ("now", 5m, 3h, 8d, 2mo, 1y): the unit and a whole count,
 * floored, so the caller only has to pick the translation for the unit.
 * Anything under a minute is "now" — the list refreshes once a minute, so a
 * seconds figure would sit frozen until the next tick. A timestamp in the
 * future (clock drift between server and browser) is "now" as well.
 */
export const shortTimeAgo = (at: Date | string, now: number): ShortTimeAgo => {
  const elapsedMs = now - new Date(at).getTime()
  if (!(elapsedMs >= MINUTE_MS)) {
    return { unit: "now", count: 0 }
  }
  if (elapsedMs < HOUR_MS) {
    return { unit: "minute", count: Math.floor(elapsedMs / MINUTE_MS) }
  }
  if (elapsedMs < DAY_MS) {
    return { unit: "hour", count: Math.floor(elapsedMs / HOUR_MS) }
  }
  const days = Math.floor(elapsedMs / DAY_MS)
  if (days < DAYS_PER_MONTH) {
    return { unit: "day", count: days }
  }
  if (days < DAYS_PER_YEAR) {
    return {
      unit: "month",
      count: Math.min(MAX_MONTHS, Math.floor(days / DAYS_PER_MONTH)),
    }
  }
  return { unit: "year", count: Math.floor(days / DAYS_PER_YEAR) }
}
