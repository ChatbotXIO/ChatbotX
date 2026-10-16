import type { LeaderboardBreakdown } from "@chatbotx.io/database/partials"

const DAY_MS = 86_400_000

/** Whole days until `endsAt` (rounded up), 0 once it has passed. */
export function daysLeft(endsAt: Date | string, now: number = Date.now()) {
  const remaining = new Date(endsAt).getTime() - now
  return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS)
}

/** Breakdown counters with a count > 0, biggest first. */
export function breakdownEntries(breakdown: Record<string, number>) {
  return Object.entries(breakdown as LeaderboardBreakdown)
    .filter((entry): entry is [keyof LeaderboardBreakdown, number] =>
      Boolean(entry[1] && entry[1] > 0),
    )
    .sort((a, b) => b[1] - a[1])
}

/** "22:00" UTC → "05:00" at `offsetMinutes` from UTC (Vietnam = +420). */
export function shiftUtcTime(utcTime: string, offsetMinutes: number) {
  const [hours, minutes] = utcTime.split(":").map(Number)
  if (
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return utcTime
  }
  const total = (((hours * 60 + minutes + offsetMinutes) % 1440) + 1440) % 1440
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

export const VIETNAM_UTC_OFFSET_MINUTES = 420
