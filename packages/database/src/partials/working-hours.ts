import { z } from "zod"

export const WORKING_HOURS_MINUTES_PER_DAY = 1440
export const WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY = 10
export const WORKING_HOURS_MAX_INTERVALS_TOTAL = 70

const minuteRangeShape = {
  startMinute: z
    .number()
    .int()
    .min(0)
    .max(WORKING_HOURS_MINUTES_PER_DAY - 1),
  endMinute: z.number().int().min(1).max(WORKING_HOURS_MINUTES_PER_DAY),
}

const startsBeforeEnd = {
  check: (range: { startMinute: number; endMinute: number }) =>
    range.startMinute < range.endMinute,
  params: {
    message: "endMinute must be greater than startMinute",
    path: ["endMinute"],
  },
}

/** One time range inside a single day; `endMinute` is end-exclusive (1440 = 24:00). */
export const workingHoursMinuteRangeSchema = z
  .object(minuteRangeShape)
  .refine(startsBeforeEnd.check, startsBeforeEnd.params)
export type WorkingHoursMinuteRangeInput = z.infer<
  typeof workingHoursMinuteRangeSchema
>

/** 0 = Sunday ... 6 = Saturday; `endMinute` is end-exclusive (1440 = 24:00). */
export const workingHoursIntervalSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    ...minuteRangeShape,
  })
  .refine(startsBeforeEnd.check, startsBeforeEnd.params)
export type WorkingHoursIntervalInput = z.infer<
  typeof workingHoursIntervalSchema
>

/** Flags a day's ranges that overlap; shared by the weekly and the date-override schemas. */
const addOverlapIssue = (
  ranges: readonly WorkingHoursMinuteRangeInput[],
  label: string,
  ctx: z.RefinementCtx,
): void => {
  const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute)
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].startMinute < sorted[index - 1].endMinute) {
      ctx.addIssue({ code: "custom", message: `Intervals overlap on ${label}` })
      return
    }
  }
}

export const workingHoursIntervalsSchema = z
  .array(workingHoursIntervalSchema)
  .max(WORKING_HOURS_MAX_INTERVALS_TOTAL)
  .superRefine((intervals, ctx) => {
    const byWeekday = new Map<number, WorkingHoursIntervalInput[]>()
    for (const interval of intervals) {
      byWeekday.set(interval.weekday, [
        ...(byWeekday.get(interval.weekday) ?? []),
        interval,
      ])
    }
    for (const [weekday, day] of byWeekday) {
      if (day.length > WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY) {
        ctx.addIssue({
          code: "custom",
          message: `At most ${WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY} intervals per weekday (weekday ${weekday})`,
        })
      }
      addOverlapIssue(day, `weekday ${weekday}`, ctx)
    }
  })

/**
 * Selection value of the `isWithinWorkingHours` contact-filter field meaning
 * "the agent assigned to the contact's DM conversation" (next to the schedule
 * ids it can be combined with). Shared by the SQL predicate and the builder UI.
 */
export const ASSIGNED_AGENT_WORKING_HOURS_VALUE = "assignedAgent"

export const WORKING_HOURS_MAX_DATE_OVERRIDES = 400
export const WORKING_HOURS_MAX_NAME_LENGTH = 100

/**
 * Ranges of one calendar date. An empty list means closed all day, so it is a
 * valid value and must always be written explicitly (the column has no default).
 */
export const workingHoursDateRangesSchema = z
  .array(workingHoursMinuteRangeSchema)
  .max(WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY)
  .superRefine((ranges, ctx) => addOverlapIssue(ranges, "this date", ctx))
export type WorkingHoursDateRanges = z.infer<
  typeof workingHoursDateRangesSchema
>

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` that is a real calendar date. */
export const workingHoursLocalDateSchema = z
  .string()
  .regex(LOCAL_DATE_PATTERN, "Expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    )
  }, "Not a real calendar date")

export const workingHoursDateOverrideInputSchema = z.object({
  date: workingHoursLocalDateSchema,
  name: z.string().trim().max(WORKING_HOURS_MAX_NAME_LENGTH).nullish(),
  ranges: workingHoursDateRangesSchema,
})
export type WorkingHoursDateOverrideInput = z.infer<
  typeof workingHoursDateOverrideInputSchema
>

export const workingHoursDateOverridesSchema = z
  .array(workingHoursDateOverrideInputSchema)
  .max(WORKING_HOURS_MAX_DATE_OVERRIDES)
  .superRefine((overrides, ctx) => {
    const seen = new Set<string>()
    for (const override of overrides) {
      if (seen.has(override.date)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate date ${override.date}`,
        })
        return
      }
      seen.add(override.date)
    }
  })
