export type CalendarCell = {
  date: Date
  inCurrentMonth: boolean
}

export const CALENDAR_WEEKS = 6
export const DAYS_PER_WEEK = 7

/**
 * Builds the fixed 6x7 day grid for a month view, Sunday-first, padded with
 * the adjacent months' days so the layout never jumps between months.
 */
export function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay())

  return Array.from({ length: CALENDAR_WEEKS * DAYS_PER_WEEK }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    )
    return { date, inCurrentMonth: date.getMonth() === month }
  })
}

export function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

const YEARS_BEFORE = 100
const YEARS_AFTER = 10

/**
 * Selectable year span: far enough back for birthday collection, far enough
 * forward for scheduling.
 */
export function buildYearOptions(currentYear: number): number[] {
  return Array.from(
    { length: YEARS_BEFORE + YEARS_AFTER + 1 },
    (_, index) => currentYear - YEARS_BEFORE + index,
  )
}

/** Replaces only the calendar day, preserving the picked time of day. */
export function withCalendarDay(value: Date, day: Date): Date {
  const next = new Date(value)
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
  return next
}

export function withTime(value: Date, hours: number, minutes: number): Date {
  const next = new Date(value)
  next.setHours(hours, minutes, 0, 0)
  return next
}
