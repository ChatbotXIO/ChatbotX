import { useLocale } from "next-intl"

/** 2023-01-01 was a Sunday: day `n` of that week is weekday `n`. */
const SUNDAY_UTC = Date.UTC(2023, 0, 1)
const DAY_MS = 86_400_000

/** The localized name of a weekday (`0` = Sunday … `6` = Saturday). */
export const useWeekdayLabels = (
  width: "long" | "short" = "long",
): ((weekday: number) => string) => {
  const locale = useLocale()
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: width,
  })
  return (weekday) => formatter.format(new Date(SUNDAY_UTC + weekday * DAY_MS))
}
