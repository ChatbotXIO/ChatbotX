import type { OpenHoursRange } from "@chatbotx.io/database/partials"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** The weekday (0 = Sunday) and `HH:mm` of `at` in `timeZone`. */
const localDayAndTime = (at: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ""
  return {
    day: WEEKDAYS.indexOf(part("weekday")),
    time: `${part("hour")}:${part("minute")}`,
  }
}

/**
 * Whether `at` falls inside one of the ranges, read in `timeZone`. A range
 * whose `to` is before its `from` runs past midnight: Monday 22:00–02:00
 * covers Monday night and early Tuesday. `to` itself is outside.
 */
export const isWithinOpenHours = (
  ranges: OpenHoursRange[],
  timeZone: string,
  at: Date = new Date(),
): boolean => {
  const { day, time } = localDayAndTime(at, timeZone)
  const previousDay = (day + 6) % 7
  return ranges.some((range) => {
    if (range.from < range.to) {
      return range.day === day && time >= range.from && time < range.to
    }
    return (
      (range.day === day && time >= range.from) ||
      (range.day === previousDay && time < range.to)
    )
  })
}
