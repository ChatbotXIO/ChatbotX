import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const timeRangeQuerySchema = z.object({
  from: z.string().transform((val) => new Date(val)),
  to: z.string().transform((val) => new Date(val)),
  timezone: z.string().default("UTC"),
  workspaceId: zodBigintAsString(),
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

export const contactInfoSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatar: z.string().nullable(),
})
export type ContactInfo = z.infer<typeof contactInfoSchema>

export type ContactEventData = {
  occurredAt: string
  sourceId?: string
  channel?: string
  conversationId?: string
  errorContent?: string | null
}
