import { z } from "zod"

export const WORKING_HOURS_MINUTES_PER_DAY = 1440
export const WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY = 10
export const WORKING_HOURS_MAX_INTERVALS_TOTAL = 70

/** 0 = Sunday ... 6 = Saturday; `endMinute` is end-exclusive (1440 = 24:00). */
export const workingHoursIntervalSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(WORKING_HOURS_MINUTES_PER_DAY - 1),
    endMinute: z.number().int().min(1).max(WORKING_HOURS_MINUTES_PER_DAY),
  })
  .refine((interval) => interval.startMinute < interval.endMinute, {
    message: "endMinute must be greater than startMinute",
    path: ["endMinute"],
  })
export type WorkingHoursIntervalInput = z.infer<
  typeof workingHoursIntervalSchema
>

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
      const sorted = [...day].sort((a, b) => a.startMinute - b.startMinute)
      for (let index = 1; index < sorted.length; index++) {
        if (sorted[index].startMinute < sorted[index - 1].endMinute) {
          ctx.addIssue({
            code: "custom",
            message: `Intervals overlap on weekday ${weekday}`,
          })
          break
        }
      }
    }
  })
