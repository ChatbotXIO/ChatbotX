const MONDAY_UTC = Date.UTC(2024, 0, 1)
const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000

/** ISO weekday (1 = Monday) as a locale name. */
export const weekdayName = (
  weekday: number,
  locale: string,
  style: "long" | "short",
): string =>
  new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: style }).format(
    new Date(MONDAY_UTC + (weekday - 1) * MS_PER_DAY),
  )

/** An hour of the day (0-23) as a locale time, e.g. `9 AM` or `09:00`. */
export const hourName = (hour: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    timeZone: "UTC",
  }).format(new Date(MONDAY_UTC + hour * MS_PER_HOUR))
