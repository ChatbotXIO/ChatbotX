/**
 * Ads analytics `from`/`to` URL params are date-only "YYYY-MM-DD" keys. The
 * shared `DateRangePresetFilter` emits `Date`s at LOCAL day boundaries (date-fns
 * `startOfDay`/`endOfDay`), so the key must be formatted from the LOCAL calendar
 * components — using `toISOString()` would re-project to UTC and shift the day
 * by one in non-UTC timezones (e.g. UTC+7 local midnight → the previous UTC
 * date), making the dashboard fetch the wrong window. Format and parse are a
 * matched pair so a written key round-trips back to the same calendar day.
 *
 * SEAM CLOSED for the DB-backed pipeline (funnel, timeseries, CSV export):
 * `parseAnalyticsDateRange` now resolves the viewer's IANA timezone (the `tz`
 * URL param, threaded alongside these keys — see `use-ads-range-url.ts`) and
 * converts the local day boundaries to exact UTC instants via `date-fns-tz`'s
 * `fromZonedTime`, and the ads-conversion repository's day-bucketing
 * (`AT TIME ZONE`) is parameterized on that same timezone. A viewer's picked
 * calendar day now queries the matching window regardless of their UTC
 * offset. See `docs/plans/2026-08-27-ads-timezone-migration.md` for the
 * completed migration record.
 *
 * RESIDUAL SEAM (by design, not a bug): Meta Graph API's `insights` endpoint
 * interprets `since`/`until` date-keys in the AD ACCOUNT's own reporting
 * timezone, not the viewer's — there is no per-request override. Spend/
 * impressions numbers reconcile with Meta Ads Manager (ad-account TZ);
 * DB-sourced conversions/funnel/timeseries reconcile with the viewer's "my
 * day" (viewer TZ). These two can legitimately disagree near midnight for a
 * viewer whose timezone differs from the ad account's — documented, not
 * fixable without Meta changing Insights' timezone contract.
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
