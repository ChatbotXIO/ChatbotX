import { z } from "zod"
import { allTimezoneCodes } from "@/features/workspaces/schema/types"

/** Meta's `day_of_week` values, in the order the week is shown and sent. */
export const CALL_HOURS_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const

export type CallHoursDay = (typeof CALL_HOURS_DAYS)[number]

/** Meta allows at most two ranges per day of the week. */
export const MAX_CALL_HOURS_RANGES_PER_DAY = 2

/** 23:59 — Meta's times are HHMM within one day, so no range runs past it. */
export const LAST_MINUTE_OF_DAY = 23 * 60 + 59

/**
 * The schedule problems Meta would reject, used as issue messages so the form
 * can translate them (`ISSUE_LABEL_KEY` in `whatsapp-call-hours-section.tsx`).
 */
export const CallHoursIssue = {
  rangeOrder: "rangeOrder",
  rangeOverlap: "rangeOverlap",
  noOpenHours: "noOpenHours",
} as const

export type CallHoursIssue =
  (typeof CallHoursIssue)[keyof typeof CallHoursIssue]

const isRuntimeTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * The workspace timezone list minus the few `Intl` refuses (it carries
 * `Factory`): the call hours action formats dates in the chosen timezone, so
 * an unusable one would fail every save.
 */
export const CALL_HOURS_TIMEZONE_CODES = allTimezoneCodes.filter(
  isRuntimeTimezone,
) as [string, ...string[]]

const minuteOfDaySchema = z.number().int().min(0).max(LAST_MINUTE_OF_DAY)

const callHoursRangeSchema = z.object({
  openMinute: minuteOfDaySchema,
  closeMinute: minuteOfDaySchema,
})

const callHoursDaySchema = z.object({
  dayOfWeek: z.enum(CALL_HOURS_DAYS),
  ranges: z.array(callHoursRangeSchema).max(MAX_CALL_HOURS_RANGES_PER_DAY),
})

/**
 * The weekly call hours of one number, one entry per day in week order. Every
 * Meta rule is enforced here so a save fails in the form instead of at Meta:
 * a range must close after it opens (so an overnight range is split across
 * two days), ranges on one day must not overlap, and the week needs at least
 * one open range — even with call hours switched off, since Meta requires a
 * non-empty `weekly_operating_hours` whenever `call_hours` is sent.
 */
export const callHoursFormSchema = z
  .object({
    enabled: z.boolean(),
    timezoneId: z.enum(CALL_HOURS_TIMEZONE_CODES),
    days: z.array(callHoursDaySchema).length(CALL_HOURS_DAYS.length),
  })
  .superRefine((data, ctx) => {
    data.days.forEach((day, dayIndex) => {
      if (day.dayOfWeek !== CALL_HOURS_DAYS[dayIndex]) {
        ctx.addIssue({
          code: "custom",
          path: ["days", dayIndex, "dayOfWeek"],
          message: "Days must be listed in week order",
        })
      }
      day.ranges.forEach((range, rangeIndex) => {
        if (range.closeMinute <= range.openMinute) {
          ctx.addIssue({
            code: "custom",
            path: ["days", dayIndex, "ranges", rangeIndex],
            message: CallHoursIssue.rangeOrder,
          })
        }
      })
      const [first, second] = day.ranges
      if (
        first &&
        second &&
        first.openMinute < second.closeMinute &&
        second.openMinute < first.closeMinute
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["days", dayIndex, "ranges"],
          message: CallHoursIssue.rangeOverlap,
        })
      }
    })
    if (data.days.every((day) => day.ranges.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: CallHoursIssue.noOpenHours,
      })
    }
  })

export type CallHoursFormValues = z.infer<typeof callHoursFormSchema>
