import type { WeekdayToggleOption } from "@chatbotx.io/ui/components/form/weekday-toggle-field"

const DAYS_PER_WEEK = 7
const SUNDAY = 0
/** Weeks start on Monday, as the rule counts them (ISO weeks) in every locale. */
const FIRST_WEEKDAY = 1
/** A known Sunday, so weekday `n` is this date plus `n` days. */
const REFERENCE_SUNDAY_UTC = Date.UTC(2024, 0, 7)
const MS_PER_DAY = 86_400_000

/** The seven weekday toggles, Monday first, with localized short and full names. */
export const buildWeekdayOptions = (locale: string): WeekdayToggleOption[] => {
  const short = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  })
  const long = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  })
  return Array.from({ length: DAYS_PER_WEEK }, (_, offset) => {
    const value = (FIRST_WEEKDAY + offset) % DAYS_PER_WEEK
    const date = new Date(REFERENCE_SUNDAY_UTC + (value - SUNDAY) * MS_PER_DAY)
    return {
      value,
      label: short.format(date),
      ariaLabel: long.format(date),
    }
  })
}
