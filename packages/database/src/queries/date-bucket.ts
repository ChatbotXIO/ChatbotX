import { timezoneCandidates } from "@chatbotx.io/utils/timezone"
import { type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import type { OccurrenceBucketGranularity } from "../partials/broadcast"

/**
 * The timezone name to hand to `AT TIME ZONE`, resolved BY PostgreSQL rather
 * than by us.
 *
 * Never interpolates the caller's timezone name straight into `AT TIME ZONE`.
 * That is what a `tz` URL param used to do, and PostgreSQL aborts the whole
 * statement on a name its tzdata does not carry:
 *
 *     ERROR: time zone "Asia/Saigon" not recognized   (SQLSTATE 22023)
 *
 * Browsers really do report those legacy names, so the crash was reachable by
 * simply opening a dashboard from Vietnam (or India, Ukraine, Argentina …) —
 * and it took down the entire page, because nothing between the repository and
 * the React error boundary catches it.
 *
 * Instead PostgreSQL itself picks the spelling it knows, from the candidates
 * `timezoneCandidates` offers, preferring the caller's own value; anything it
 * recognizes none of degrades to UTC rather than failing the request. The
 * subquery is uncorrelated, so the planner evaluates it once per statement as
 * an InitPlan, not per row.
 *
 */
export function resolvedTimezone(timezone: string): SQL<string> {
  const candidates = timezoneCandidates(timezone)
  const preferred = candidates[0]
  return sql<string>`COALESCE((SELECT name FROM pg_timezone_names WHERE name IN ${candidates} ORDER BY (name = ${preferred}) DESC LIMIT 1), 'UTC')`
}

/**
 * `YYYY-MM-DD` day key for `column`, bucketed in `timezone` via
 * {@link resolvedTimezone}.
 *
 * `AT TIME ZONE` (not `DATE(col)` or `col::date`) because those two read the
 * session timezone instead, which is not ours to rely on.
 */
export function zonedDateKey(column: PgColumn, timezone: string): SQL<string> {
  return sql<string>`to_char(${column} AT TIME ZONE ${resolvedTimezone(timezone)}, 'YYYY-MM-DD')`
}

/** Fixed `date_trunc` units — the granularity never reaches SQL as free text. `week` starts on Monday (ISO). */
const DATE_TRUNC_UNIT: Record<OccurrenceBucketGranularity, SQL> = {
  day: sql.raw("'day'"),
  week: sql.raw("'week'"),
  month: sql.raw("'month'"),
}

/**
 * `YYYY-MM-DD` key of the day / ISO week / month that holds `column`, bucketed
 * in `timezone` via {@link resolvedTimezone}. The key is the local first day of
 * the bucket, so it sorts chronologically as plain text and is safe to use as
 * a keyset cursor.
 */
export function zonedBucketKey(
  column: PgColumn,
  granularity: OccurrenceBucketGranularity,
  timezone: string,
): SQL<string> {
  return sql<string>`to_char(date_trunc(${DATE_TRUNC_UNIT[granularity]}, ${column} AT TIME ZONE ${resolvedTimezone(timezone)}), 'YYYY-MM-DD')`
}

/**
 * `YYYY-MM-DDTHH` key of the local hour that holds `column`, in `timezone`
 * via {@link resolvedTimezone} — for a one-day chart.
 */
export function zonedHourKey(column: PgColumn, timezone: string): SQL<string> {
  return sql<string>`to_char(date_trunc('hour', ${column} AT TIME ZONE ${resolvedTimezone(timezone)}), 'YYYY-MM-DD"T"HH24')`
}
