/**
 * Lives here, not in the builder, because both sides need the same answer: the
 * settings UI to describe the schedule, and the worker to decide whether an
 * inbound connect should ring agents. Two implementations would drift, and the
 * worker's copy is the one customers feel.
 */

/** Meta's day names, indexed to match Date.getUTCDay() (0 = Sunday). */
const DAY_BY_INDEX = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const

export type CallHoursDay = (typeof DAY_BY_INDEX)[number]

const isCallHoursDay = (value: string): value is CallHoursDay =>
  (DAY_BY_INDEX as readonly string[]).includes(value)

export type CallHoursWindow = {
  dayOfWeek: string
  /** HHMM or HH:MM, as Meta encodes it. */
  openTime: string
  closeTime: string
}

/** A single-date override of the weekly schedule. date is YYYY-MM-DD. */
export type CallHoursHoliday = {
  date: string
  startTime: string
  endTime: string
}

export type CallHoursSchedule = {
  status: "ENABLED" | "DISABLED"
  timezoneId: string
  weeklyOperatingHours: CallHoursWindow[]
  holidaySchedule?: CallHoursHoliday[]
}

const TIME_PATTERN = /^(\d{1,2}):?(\d{2})$/
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * 60

/** Minutes since midnight, or null when the value is not a time Meta emits. */
export function parseCallTime(value: string): number | null {
  // Typed as string, but it arrives from a jsonb column - a row holding a
  // number or null must read as unparseable, not throw.
  if (typeof value !== "string") {
    return null
  }
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) {
    return null
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) {
    return null
  }
  return hours * MINUTES_PER_HOUR + minutes
}

/**
 * Intl is used rather than manual offset maths so daylight saving is handled by
 * the platform's tz database - a schedule that shifts an hour twice a year is
 * exactly the bug nobody notices until a customer cannot call.
 */
function localParts(
  at: Date,
  timeZone: string,
): { day: CallHoursDay; minuteOfDay: number; date: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = new Map(
    formatter.formatToParts(at).map((part) => [part.type, part.value]),
  )
  const weekday = (parts.get("weekday") ?? "").toUpperCase() as CallHoursDay
  // hour12: false yields "24" at midnight in some engines.
  const hour = Number(parts.get("hour") ?? "0") % 24
  const minute = Number(parts.get("minute") ?? "0")
  return {
    day: weekday,
    minuteOfDay: hour * MINUTES_PER_HOUR + minute,
    // The calendar date in the schedule's own zone - a holiday is a local date,
    // so comparing against a UTC date would shift it by a day for most of the
    // world.
    date: `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`,
  }
}

/**
 * A holiday override's hours, which Meta encodes as start_time/end_time rather
 * than open/close. end_time is inclusive here, unlike a weekly window's
 * close_time: Meta's own "open all day" example is 0000-2359, and an exclusive
 * end would shut the number for that final minute every holiday.
 */
function holidayCoversMinute(
  holiday: CallHoursHoliday,
  minuteOfDay: number,
): boolean {
  const start = parseCallTime(holiday.startTime)
  const end = parseCallTime(holiday.endTime)
  // Meta requires the start to come before the end, so a range that does not is
  // a row we cannot trust - and a holiday is the only thing consulted on its
  // date, so reading it wrongly would close the number for the whole day.
  if (start === null || end === null || end <= start) {
    return true
  }
  return minuteOfDay >= start && minuteOfDay <= end
}

/**
 * A window that closes at or before it opens runs past midnight - its after-
 * midnight half belongs to the next calendar day and is deliberately not
 * matched here (spillsIntoNextDay handles that half). A Monday 22:00-02:00
 * window would otherwise take calls at Monday 01:00, a full day early.
 */
function coversMinute(window: CallHoursWindow, minuteOfDay: number): boolean {
  const open = parseCallTime(window.openTime)
  const close = parseCallTime(window.closeTime)
  if (open === null || close === null) {
    // Availability-first: a window we cannot read must not close the number.
    return true
  }
  if (close <= open) {
    return minuteOfDay >= open
  }
  return minuteOfDay >= open && minuteOfDay < close
}

/**
 * The minute-of-day an overnight window stops covering the following day, or
 * null when it does not run past midnight.
 */
function spillsIntoNextDay(window: CallHoursWindow): number | null {
  const open = parseCallTime(window.openTime)
  const close = parseCallTime(window.closeTime)
  if (open === null || close === null || close > open) {
    return null
  }
  return close
}

/**
 * Open by default: a missing schedule, a disabled one, or one with no windows
 * all mean no restriction configured. Only an enabled schedule that lists
 * windows can refuse a call, so a malformed config can never silently make a
 * number unreachable.
 */
export function isWithinCallHours(
  schedule: CallHoursSchedule | null | undefined,
  at: Date = new Date(),
): boolean {
  if (schedule?.status !== "ENABLED") {
    return true
  }
  // Array.isArray, not a truthiness check: the schedule is read back from a
  // jsonb column, so a hand-edited row can hold anything. Anything
  // that is not a list of windows is no restriction configured, never a thrown
  // TypeError inside the inbound gate.
  const windows = schedule.weeklyOperatingHours
  if (!Array.isArray(windows) || windows.length === 0) {
    return true
  }

  let parts: { day: CallHoursDay; minuteOfDay: number; date: string }
  try {
    parts = localParts(at, schedule.timezoneId)
  } catch {
    // An unknown timezone id must not lock customers out.
    return true
  }

  // A holiday replaces the weekly schedule for its date, so when one matches
  // today it is the only thing consulted - a weekly window must not re-open a
  // closed holiday.
  const holidays = Array.isArray(schedule.holidaySchedule)
    ? schedule.holidaySchedule.filter(
        (holiday) =>
          holiday && typeof holiday === "object" && holiday.date === parts.date,
      )
    : []
  if (holidays.length > 0) {
    return holidays.some((holiday) =>
      holidayCoversMinute(holiday, parts.minuteOfDay),
    )
  }

  const previousDay =
    DAY_BY_INDEX[(DAY_BY_INDEX.indexOf(parts.day) + 6) % DAY_BY_INDEX.length]

  return windows.some((window) => {
    // An entry we cannot even attribute to a day says nothing about today, and
    // a schedule holding one is not trustworthy enough to refuse a call on.
    if (!window || typeof window !== "object") {
      return true
    }
    const day =
      typeof window.dayOfWeek === "string" ? window.dayOfWeek.toUpperCase() : ""
    // A day name Meta does not define can never match, so a schedule made only
    // of them would close the number every day without ever saying so - same
    // availability-first treatment as an entry with no day.
    if (!isCallHoursDay(day)) {
      return true
    }
    if (day === parts.day) {
      return coversMinute(window, parts.minuteOfDay)
    }
    // An overnight window also covers the early hours of the following day,
    // which Meta stores under the previous day's entry.
    if (day !== previousDay) {
      return false
    }
    const spill = spillsIntoNextDay(window)
    return spill !== null && parts.minuteOfDay < spill
  })
}

export const CALL_HOURS_MINUTES_PER_DAY = MINUTES_PER_DAY
