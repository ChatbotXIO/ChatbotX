import { z } from "zod"

export const timeRangeQuerySchema = z.object({
  from: z.string().transform((val) => new Date(val)),
  to: z.string().transform((val) => new Date(val)),
  timezone: z.string().default("UTC"),
  chatbotId: z.string(),
})
export type TimeRangeQuery = z.infer<typeof timeRangeQuerySchema>

export const granularityDayHourMinuteSchema = z.enum(["minute", "hour", "day"])
export const granularityDayMonthSchema = z.enum(["day", "month"])

export const timeRangeQueryWithGranularityMHDSchema =
  timeRangeQuerySchema.extend({
    granularity: granularityDayHourMinuteSchema.default("day"),
  })

export const timeRangeQueryWithGranularityDMSchema =
  timeRangeQuerySchema.extend({
    granularity: granularityDayMonthSchema.default("day"),
  })
