/**
 * Ads analytics `from`/`to` URL params are date-only "YYYY-MM-DD" keys. The
 * shared `DateRangePresetFilter` emits `Date`s at LOCAL day boundaries (date-fns
 * `startOfDay`/`endOfDay`), so the key must be formatted from the LOCAL calendar
 * components — using `toISOString()` would re-project to UTC and shift the day
 * by one in non-UTC timezones (e.g. UTC+7 local midnight → the previous UTC
 * date), making the dashboard fetch the wrong window. Format and parse are a
 * matched pair so a written key round-trips back to the same calendar day.
 *
 * KNOWN INTERIM SEAM (tracked): these keys are the user's LOCAL calendar day,
 * but `parseAnalyticsDateRange` / the ads-conversion repository still anchor and
 * bucket by UTC day (`... AT TIME ZONE 'UTC' ...`). For a non-UTC viewer that
 * shifts the queried window by their UTC offset. This is deliberate: the shared
 * filter is local-oriented (its forward-compatible, correct end-state), and the
 * full move of the Ads reporting pipeline off hardcoded UTC — day-bucketing,
 * the funnel/spend day-keys, the external CSV contract, and the ad-account
 * reporting timezone — is a separate planned project. See
 * `docs/plans/2026-08-27-ads-timezone-migration.md`.
 */

const pad = (value: number): string => String(value).padStart(2, "0")

/** Local calendar day of a `Date` as a "YYYY-MM-DD" key. */
export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parses a "YYYY-MM-DD" key back to LOCAL midnight of that calendar day. */
export function parseLocalDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}
