import { addMonths, lastDayOfMonth as dfLastDayOfMonth } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"

type LocalDateParts = { year: number; month: number; day: number }

function partsInTimezone(date: Date, timezone: string): LocalDateParts {
  const formatted = formatInTimeZone(date, timezone, "yyyy-MM-dd")
  const [yearRaw, monthRaw, dayRaw] = formatted.split("-")
  return {
    year: Number.parseInt(yearRaw, 10),
    month: Number.parseInt(monthRaw, 10),
    day: Number.parseInt(dayRaw, 10),
  }
}

function lastDayOfMonth(year: number, month: number): number {
  return dfLastDayOfMonth(new Date(Date.UTC(year, month - 1, 1))).getUTCDate()
}

function toIsoDate({ year, month, day }: LocalDateParts): string {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

function addMonth(
  parts: LocalDateParts,
  months: number,
  anchorDay: number,
): LocalDateParts {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, anchorDay))
  const shifted = addMonths(base, months)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth() + 1
  const day = Math.min(anchorDay, lastDayOfMonth(year, month))
  return { year, month, day }
}

export function formatLocalDate(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd")
}

export function truncateHourInTimezone(date: Date, timezone: string): Date {
  const zonedIso = formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:00:00XXX")
  return new Date(zonedIso)
}

export type PeriodBounds = {
  start: string
  end: string
}

export function periodContaining(
  date: Date,
  timezone: string,
  anchorDay: number,
): PeriodBounds {
  const local = partsInTimezone(date, timezone)
  const clampedAnchorThisMonth = Math.min(
    anchorDay,
    lastDayOfMonth(local.year, local.month),
  )

  const startParts =
    local.day >= clampedAnchorThisMonth
      ? { year: local.year, month: local.month, day: clampedAnchorThisMonth }
      : addMonth(local, -1, anchorDay)

  const endParts = addMonth(startParts, 1, anchorDay)

  return {
    start: toIsoDate(startParts),
    end: toIsoDate(endParts),
  }
}

export function resolveAnchorDay(input: {
  subscriptionPeriodStart?: Date | null
  subscriptionStatus?: string | null
  workspaceCreatedAt: Date
  timezone: string
}): number {
  const isActive =
    input.subscriptionStatus === "active" ||
    input.subscriptionStatus === "trialing"
  const anchorSource =
    isActive && input.subscriptionPeriodStart
      ? input.subscriptionPeriodStart
      : input.workspaceCreatedAt
  return Number.parseInt(
    formatInTimeZone(anchorSource, input.timezone, "d"),
    10,
  )
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

export function macCountCacheKey(
  workspaceId: string,
  billingId: string,
): string {
  return `mac:count:${workspaceId}:${billingId}`
}
