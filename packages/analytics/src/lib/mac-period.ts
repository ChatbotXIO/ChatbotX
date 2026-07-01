import { formatInTimeZone } from "date-fns-tz"

export function truncateHourInTimezone(date: Date, timezone: string): Date {
  const zonedIso = formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:00:00XXX")
  return new Date(zonedIso)
}

export function calcEndOfDayTtl(timezone = "UTC"): number {
  const now = new Date()
  const endOfDayIso = formatInTimeZone(
    now,
    timezone,
    "yyyy-MM-dd'T'23:59:59XXX",
  )
  const endOfDay = new Date(endOfDayIso)
  const diffMs = endOfDay.getTime() - now.getTime()
  return Math.max(Math.floor(diffMs / 1000), 60)
}

export function secondsUntilEndOfHour(now: Date): number {
  return 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds())
}

export function workspaceMacCacheKey(workspaceId: string): string {
  return `mac:count:ws:${workspaceId}`
}

function startOfMinuteUtc(date: Date): Date {
  const truncated = new Date(date)
  truncated.setUTCSeconds(0, 0)
  return truncated
}

/**
 * Adds `months` to `anchor`, clamping the day to the last day of the target
 * month. This mirrors PostgreSQL `timestamp + interval 'N month'` semantics
 * (e.g. Jan 31 + 1 month = Feb 28) so JS-computed period bounds stay identical
 * to those produced by the SQL backfill. Naive `Date.setUTCMonth` overflows
 * instead (Jan 31 + 1 month = Mar 3), which would create mismatched period
 * rows.
 */
function addMonthsClampedUtc(anchor: Date, months: number): Date {
  const monthIndex = anchor.getUTCMonth() + months
  const targetYear = anchor.getUTCFullYear() + Math.floor(monthIndex / 12)
  const targetMonth = ((monthIndex % 12) + 12) % 12
  // Day 0 of next month resolves to the last day of the target month.
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate()
  const day = Math.min(anchor.getUTCDate(), lastDay)
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      0,
      0,
    ),
  )
}

export type AnchoredPeriodBounds = {
  start: Date
  end: Date
}

/**
 * Returns the billing period containing `occurredAt`, anchored to the
 * day/hour/minute of `billingPeriodStart` (the `Billing.periodStart` of the
 * active billing record). Bounds are always computed as `anchor + k months`
 * (clamped) so they are stable and overflow-free. End = start + 1 month.
 */
export function anchoredPeriod(
  occurredAt: Date,
  billingPeriodStart: Date,
): AnchoredPeriodBounds {
  const anchor = startOfMinuteUtc(billingPeriodStart)

  // Estimate the month offset, then correct for clamping/boundary drift.
  let months =
    (occurredAt.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (occurredAt.getUTCMonth() - anchor.getUTCMonth())

  let start = addMonthsClampedUtc(anchor, months)
  while (start.getTime() > occurredAt.getTime()) {
    months -= 1
    start = addMonthsClampedUtc(anchor, months)
  }

  let end = addMonthsClampedUtc(anchor, months + 1)
  while (end.getTime() <= occurredAt.getTime()) {
    months += 1
    start = end
    end = addMonthsClampedUtc(anchor, months + 1)
  }

  return { start, end }
}
