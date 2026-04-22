import { MAC_EVENT_TYPE, type MacEventType } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const macEventTypeSchema = z.enum([
  "message_in",
  "message_out",
  "reaction",
])
export type MacEventTypeName = z.infer<typeof macEventTypeSchema>

export const MAC_EVENT_TYPE_CODE: Record<MacEventTypeName, MacEventType> = {
  message_in: MAC_EVENT_TYPE.MESSAGE_IN,
  message_out: MAC_EVENT_TYPE.MESSAGE_OUT,
  reaction: MAC_EVENT_TYPE.REACTION,
}

export type MacCountCacheValue = {
  periodStart: string
  periodEnd: string | null
  macCount: number
}

export const macInputEventSchema = z.object({
  workspaceId: z.string(),
  contactId: z.string(),
  contactInboxId: z.string(),
  inboxId: z.string(),
  eventType: macEventTypeSchema,
  occurredAt: z.date(),
  sourceId: z.string().optional(),
})
export type MacInputEvent = z.infer<typeof macInputEventSchema>

export const macMessageOutPayloadSchema = z.object({
  context: z.object({
    workspaceId: z.string(),
    contactId: z.string(),
    contactInboxId: z.string().optional(),
    inboxId: z.string().optional(),
    channel: z.string(),
  }),
  occurredAt: z.union([z.string(), z.date()]),
  action: z.object({
    sourceId: z.string().nullish(),
    messageId: z.string().optional(),
  }),
})
export type MacMessageOutPayload = z.infer<typeof macMessageOutPayloadSchema>

export const macMessageInPayloadSchema = z.object({
  workspaceId: z.string(),
  contactId: z.string(),
  contactInboxId: z.string(),
  inboxId: z.string(),
  occurredAt: z.date(),
  sourceId: z.string().nullish(),
})
export type MacMessageInPayload = z.infer<typeof macMessageInPayloadSchema>

export const macTotalResponseSchema = z.object({
  data: z.object({
    periodStart: z.string(),
    periodEnd: z.string().nullable(),
    macCount: z.number(),
  }),
})

export const macTrendPointSchema = z.object({
  period: z.string(),
  macCount: z.number(),
})
export type MacTrendPoint = z.infer<typeof macTrendPointSchema>

export const macPeriodTrendPointSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  macCount: z.number(),
})
export type MacPeriodTrendPoint = z.infer<typeof macPeriodTrendPointSchema>

export const macTrendResponseSchema = z.object({
  data: z.array(macTrendPointSchema),
})

export const macPeriodTrendResponseSchema = z.object({
  data: z.array(macPeriodTrendPointSchema),
})

export const macCurrentPeriodResponseSchema = z.object({
  data: z.object({
    periodStart: z.string(),
    periodEnd: z.string(),
  }),
})

export const getPeriodContainingInputSchema = z.object({
  workspaceId: z.string(),
  at: z.date(),
})
export type GetPeriodContainingInput = z.infer<
  typeof getPeriodContainingInputSchema
>

export const getPeriodContainingOutputSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
})
export type GetPeriodContainingOutput = z.infer<
  typeof getPeriodContainingOutputSchema
>

export const getPeriodTotalInputSchema = z.object({
  workspaceId: z.string(),
  billingId: z.string(),
})
export type GetPeriodTotalInput = z.infer<typeof getPeriodTotalInputSchema>

export const getPeriodTotalOutputSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string().nullable(),
  macCount: z.number(),
})
export type GetPeriodTotalOutput = z.infer<typeof getPeriodTotalOutputSchema>

export const getPeriodTrendInputSchema = z.object({
  workspaceId: z.string(),
  from: z.string(),
  to: z.string(),
})
export type GetPeriodTrendInput = z.infer<typeof getPeriodTrendInputSchema>

export const getBreakdownInputSchema = z.object({
  workspaceId: z.string(),
  from: z.string(),
  to: z.string(),
})
export type GetBreakdownInput = z.infer<typeof getBreakdownInputSchema>

export const getHourlyBreakdownInputSchema = z.object({
  workspaceId: z.string(),
  from: z.date(),
  to: z.date(),
})
export type GetHourlyBreakdownInput = z.infer<
  typeof getHourlyBreakdownInputSchema
>

export const reconcilePeriodInputSchema = z.object({
  workspaceId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
})
export type ReconcilePeriodInput = z.infer<typeof reconcilePeriodInputSchema>
