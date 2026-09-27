import type { WhatsappCallHoursSnapshot } from "@chatbotx.io/database/partials"
import type {
  WhatsappCallHours,
  WhatsappCallingHolidaySchedule,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import {
  CALL_HOURS_DAYS,
  CALL_HOURS_TIMEZONE_CODES,
  type CallHoursFormValues,
  LAST_MINUTE_OF_DAY,
} from "../schemas/call-hours-schema"

export { CALL_HOURS_DAYS } from "../schemas/call-hours-schema"

const FALLBACK_TIMEZONE = "Etc/UTC"
const timezoneCodeSet = new Set<string>(CALL_HOURS_TIMEZONE_CODES)

/** A new number's schedule: weekdays, 09:00-17:00. */
const DEFAULT_OPEN_MINUTE = 9 * 60
const DEFAULT_CLOSE_MINUTE = 17 * 60
const DEFAULT_OPEN_DAYS = new Set(CALL_HOURS_DAYS.slice(0, 5))

/** Meta writes `"0400"`, and its API reference also shows `"04:00"`. */
const META_CALL_TIME = /^(\d{2}):?(\d{2})$/
const MINUTES_PER_HOUR = 60

/** Minutes since midnight for a Meta call time, or `null` when it is not a time of day. */
export const parseMetaCallTime = (value: string): number | null => {
  const match = META_CALL_TIME.exec(value)
  if (!match) {
    return null
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes >= MINUTES_PER_HOUR) {
    return null
  }
  return hours * MINUTES_PER_HOUR + minutes
}

/** Meta's `HHMM` for minutes since midnight. */
export const formatMetaCallTime = (minuteOfDay: number): string => {
  const clamped = Math.min(Math.max(minuteOfDay, 0), LAST_MINUTE_OF_DAY)
  const hours = Math.floor(clamped / MINUTES_PER_HOUR)
  const minutes = clamped % MINUTES_PER_HOUR
  return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`
}

/**
 * The form's starting values: Meta's schedule when the number has one, else
 * weekdays 09:00-17:00 in the workspace timezone with call hours off. A Meta
 * entry whose times can't be read is skipped rather than guessed at.
 */
export const buildCallHoursFormValues = (
  callHours: WhatsappCallHours | undefined,
  workspaceTimezone: string,
): CallHoursFormValues => {
  if (!callHours) {
    return {
      enabled: false,
      timezoneId: knownTimezone(workspaceTimezone),
      days: CALL_HOURS_DAYS.map((dayOfWeek) => ({
        dayOfWeek,
        ranges: DEFAULT_OPEN_DAYS.has(dayOfWeek)
          ? [
              {
                openMinute: DEFAULT_OPEN_MINUTE,
                closeMinute: DEFAULT_CLOSE_MINUTE,
              },
            ]
          : [],
      })),
    }
  }

  return {
    enabled: callHours.status === "ENABLED",
    timezoneId: knownTimezone(callHours.timezone_id, workspaceTimezone),
    days: CALL_HOURS_DAYS.map((dayOfWeek) => ({
      dayOfWeek,
      ranges: (callHours.weekly_operating_hours ?? [])
        .filter((entry) => entry.day_of_week === dayOfWeek)
        .flatMap((entry) => {
          const openMinute = parseMetaCallTime(entry.open_time)
          const closeMinute = parseMetaCallTime(entry.close_time)
          return openMinute === null || closeMinute === null
            ? []
            : [{ openMinute, closeMinute }]
        })
        .sort((a, b) => a.openMinute - b.openMinute),
    })),
  }
}

/**
 * The complete `call_hours` object for Meta. Meta replaces `call_hours`
 * wholesale — an omitted `holiday_schedule` is deleted — so the caller passes
 * the holidays to keep.
 */
export const toMetaCallHours = (
  values: CallHoursFormValues,
  holidaySchedule?: WhatsappCallingHolidaySchedule[],
): WhatsappCallHours => ({
  status: values.enabled ? "ENABLED" : "DISABLED",
  timezone_id: values.timezoneId,
  weekly_operating_hours: values.days.flatMap((day) =>
    [...day.ranges]
      .sort((a, b) => a.openMinute - b.openMinute)
      .map((range) => ({
        day_of_week: day.dayOfWeek,
        open_time: formatMetaCallTime(range.openMinute),
        close_time: formatMetaCallTime(range.closeMinute),
      })),
  ),
  ...(holidaySchedule === undefined
    ? {}
    : { holiday_schedule: holidaySchedule }),
})

/**
 * The holidays still ahead in the number's timezone. Meta rejects a
 * `call_hours` update carrying a past holiday, so a holiday that has passed
 * since it was set would otherwise make every later save fail.
 */
export const upcomingHolidays = (
  holidays: WhatsappCallingHolidaySchedule[] | undefined,
  timezoneId: string,
  now: Date = new Date(),
): WhatsappCallingHolidaySchedule[] | undefined => {
  if (!holidays) {
    return
  }
  // `en-CA` formats a date as YYYY-MM-DD, so it compares as a string.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  return holidays.filter((holiday) => holiday.date >= today)
}

const knownTimezone = (...candidates: string[]): string =>
  candidates.find((timezone) => timezoneCodeSet.has(timezone)) ??
  FALLBACK_TIMEZONE

/**
 * Meta's snake_case call_hours in the shape the runtime stores and reads.
 *
 * The timezone carried here is the one chosen in Call settings, never the
 * workspace's - a number serving another market keeps its own hours even when
 * the workspace timezone changes for reporting.
 */
export const toCallHoursSnapshot = (
  callHours: WhatsappCallHours,
): WhatsappCallHoursSnapshot => ({
  status: callHours.status,
  timezoneId: callHours.timezone_id,
  weeklyOperatingHours: (callHours.weekly_operating_hours ?? []).map(
    (window) => ({
      dayOfWeek: window.day_of_week,
      openTime: window.open_time,
      closeTime: window.close_time,
    }),
  ),
  holidaySchedule: callHours.holiday_schedule?.map((holiday) => ({
    date: holiday.date,
    startTime: holiday.start_time,
    endTime: holiday.end_time,
  })),
})
