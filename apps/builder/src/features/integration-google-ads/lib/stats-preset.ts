import type { PresetOption } from "@chatbotx.io/analytics-nextjs/schemas"
import { formatInTimeZone } from "date-fns-tz"

// The shared `resolvePresetOption` classifies against the runtime's LOCAL
// "today", which differs between the server and the browser around midnight and
// would hydrate to a different label. This page already has the resolved
// range and its timezone, so the preset is classified in that zone instead:
// the server render and the browser agree on the first paint. The presets
// mirror the shared control's (`DateRangePresetFilter`) list.

const MS_PER_DAY = 86_400_000
/** The shared control's Lifetime floor. */
const LIFETIME_FLOOR = new Date("2020-01-01T00:00:00.000Z")

type DayRange = { from: string; to: string }

const dayKeyIn = (date: Date, tz: string): string =>
  formatInTimeZone(date, tz, "yyyy-MM-dd")

const addDays = (dayKey: string, days: number): string =>
  new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)

const monthStart = (dayKey: string): string => `${dayKey.slice(0, 7)}-01`

const monthEnd = (dayKey: string): string => {
  const next = new Date(`${monthStart(dayKey)}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return addDays(next.toISOString().slice(0, 10), -1)
}

const presetRanges = (
  today: string,
  lifetimeFrom: string,
): Record<Exclude<PresetOption, "custom">, DayRange> => {
  const lastMonthDay = addDays(monthStart(today), -1)
  return {
    today: { from: today, to: today },
    yesterday: { from: addDays(today, -1), to: addDays(today, -1) },
    last7: { from: addDays(today, -6), to: today },
    last30: { from: addDays(today, -29), to: today },
    thisMonth: { from: monthStart(today), to: monthEnd(today) },
    lastMonth: { from: monthStart(lastMonthDay), to: lastMonthDay },
    lifeTime: { from: lifetimeFrom, to: today },
  }
}

/**
 * The preset a range of day keys corresponds to when "today" is read in `tz`,
 * or "custom". `now` is required (no clock read in here), so a server render and
 * its hydration classify with the SAME instant even across a midnight in `tz`.
 */
export const resolveRangePreset = (input: {
  range: DayRange
  tz: string
  workspaceCreatedAt: Date
  /** The instant "today" is read at; the caller owns it so renders agree. */
  now: Date
}): PresetOption => {
  const { range, tz, workspaceCreatedAt, now } = input
  const floor =
    workspaceCreatedAt > LIFETIME_FLOOR ? workspaceCreatedAt : LIFETIME_FLOOR
  const ranges = presetRanges(dayKeyIn(now, tz), dayKeyIn(floor, tz))
  const matched = (Object.keys(ranges) as (keyof typeof ranges)[]).find(
    (preset) =>
      ranges[preset].from === range.from && ranges[preset].to === range.to,
  )
  return matched ?? "custom"
}
