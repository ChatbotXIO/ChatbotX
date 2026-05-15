import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const FROM_FLOOR = new Date("2020-01-01T00:00:00.000Z")

export const timeRangeQuerySchema = z.object({
  from: z.string().transform((val) => {
    const d = new Date(val)
    return d < FROM_FLOOR ? FROM_FLOOR : d
  }),
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

export const contactEventData = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  occurredAt: z.string(),
  sourceId: z.string().optional(),
  channel: z.string().optional(),
  conversationId: z.string().optional(),
  errorContent: z.string().nullable().optional(),
})

export type ContactEventData = z.infer<typeof contactEventData>
