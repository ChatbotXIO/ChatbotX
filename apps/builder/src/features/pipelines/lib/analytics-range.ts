import { dateKeyIn } from "@/features/custom-fields/lib/field-date"

/** Moves a `YYYY-MM-DD` key by whole calendar days (no clock math, so DST cannot skew it). */
const shiftDateKey = (key: string, days: number) => {
  const [year, month, day] = key.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

/** The last `days` calendar days in `timeZone`, today included. */
export const rangeEndingToday = (days: number, timeZone: string, now: Date) => {
  const to = dateKeyIn(now, timeZone)
  return { from: shiftDateKey(to, -(days - 1)), to }
}

/** The `YYYY-MM-DD` keys of a picked date range, read on `timeZone`'s calendar. */
export const dayKeysFromDates = (
  range: { from: Date; to: Date },
  timeZone: string,
) => ({
  from: dateKeyIn(range.from, timeZone),
  to: dateKeyIn(range.to, timeZone),
})
