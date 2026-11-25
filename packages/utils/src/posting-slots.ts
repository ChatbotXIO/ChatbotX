import { formatInTimeZone } from "date-fns-tz"
import { z } from "zod"
import { localDateOf, resolveZonedInstant } from "./recurrence"

/** Most posting times one weekday of a posting schedule can hold. */
export const POSTING_SLOT_MAX_TIMES_PER_DAY = 10
const DAYS_PER_WEEK = 7
/** `listFreeSlots` never looks further ahead than this (the scheduling window is one year). */
export const POSTING_SLOT_HORIZON_DAYS = 366
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const postingSlotTime = z
  .string()
  .regex(TIME_PATTERN)
  .describe("24-hour wall-clock time, HH:mm, in the schedule's time zone.")

export const postingScheduleDay = z.strictObject({
  enabled: z.boolean(),
  times: z.array(postingSlotTime).max(POSTING_SLOT_MAX_TIMES_PER_DAY),
  weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .describe("0 = Sunday … 6 = Saturday."),
})
export type PostingScheduleDay = z.infer<typeof postingScheduleDay>

/** Exactly seven days, one per weekday. */
export const postingScheduleSlots = z
  .array(postingScheduleDay)
  .length(DAYS_PER_WEEK)
  .refine(
    (days) => new Set(days.map((day) => day.weekday)).size === DAYS_PER_WEEK,
    { message: "Give each weekday (0-6) exactly once" },
  )
export type PostingScheduleSlots = z.infer<typeof postingScheduleSlots>

/** A posting schedule as the slot maths needs it. */
export type PostingSchedule = {
  slots: readonly PostingScheduleDay[]
  timezone: string
}

/** Every weekday off: what a destination has before anyone sets times. */
export const emptyPostingSlots = (): PostingScheduleSlots =>
  Array.from({ length: DAYS_PER_WEEK }, (_, weekday) => ({
    enabled: false,
    times: [],
    weekday,
  }))

/** Weekdays in order, times sorted and without repeats: one spelling per schedule. */
export const normalisePostingSlots = (
  slots: readonly PostingScheduleDay[],
): PostingScheduleSlots =>
  [...slots]
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => ({
      enabled: day.enabled,
      times: [...new Set(day.times)].sort(),
      weekday: day.weekday,
    }))

const weekdayOf = (localDate: string): number => {
  const [year, month, day] = localDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

const addDays = (localDate: string, days: number): string => {
  const [year, month, day] = localDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

/**
 * The next `count` posting instants strictly after `after` that no queued
 * target occupies. Local times are resolved day by day in the schedule's zone
 * with the broadcast daylight-saving policy (an ambiguous time takes the
 * earlier instant, a skipped one moves forward by the gap), so a schedule keeps
 * its wall clock across a clock change. A disabled day gives nothing. The
 * search stops after `POSTING_SLOT_HORIZON_DAYS` days, so a schedule with no
 * times returns `[]` instead of looping.
 */
export const listFreeSlots = (input: {
  after: Date
  count: number
  occupied: readonly Date[]
  schedule: PostingSchedule
}): Date[] => {
  const { after, count, schedule } = input
  const taken = new Set(input.occupied.map((instant) => instant.getTime()))
  const dayByWeekday = new Map(
    schedule.slots
      .filter((day) => day.enabled && day.times.length > 0)
      .map((day) => [day.weekday, day]),
  )
  const found: Date[] = []
  if (count <= 0 || dayByWeekday.size === 0) {
    return found
  }
  const startDate = localDateOf(after, schedule.timezone)
  for (
    let offset = 0;
    offset <= POSTING_SLOT_HORIZON_DAYS && found.length < count;
    offset++
  ) {
    const date = addDays(startDate, offset)
    const day = dayByWeekday.get(weekdayOf(date))
    if (!day) {
      continue
    }
    const instants = new Set<number>()
    for (const time of day.times) {
      const instant = resolveZonedInstant(date, time, schedule.timezone)
      const ms = instant.getTime()
      if (ms > after.getTime() && !taken.has(ms)) {
        instants.add(ms)
      }
    }
    for (const ms of [...instants].sort((a, b) => a - b)) {
      if (found.length < count) {
        found.push(new Date(ms))
      }
    }
  }
  return found
}

/** True when `instant` is one of the schedule's posting times (ignoring who occupies it). */
export const isPostingSlot = (
  schedule: PostingSchedule,
  instant: Date,
): boolean => {
  const date = localDateOf(instant, schedule.timezone)
  const day = schedule.slots.find((d) => d.weekday === weekdayOf(date))
  if (!day?.enabled) {
    return false
  }
  return day.times.some(
    (time) =>
      resolveZonedInstant(date, time, schedule.timezone).getTime() ===
      instant.getTime(),
  )
}

/**
 * The same wall clock (date and `HH:mm`) in another zone: what changing a
 * schedule's time zone means for a time that was picked as a local time. The
 * new zone's daylight-saving policy decides an ambiguous or skipped time.
 */
export const moveWallClockToZone = (
  instant: Date,
  fromTimezone: string,
  toTimezone: string,
): Date =>
  resolveZonedInstant(
    localDateOf(instant, fromTimezone),
    formatInTimeZone(instant, fromTimezone, "HH:mm"),
    toTimezone,
  )
