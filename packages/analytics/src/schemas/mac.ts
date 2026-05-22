import {
  MAC_EVENT_TYPE,
  type MacEventType,
} from "@chatbotx.io/database/partials"
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
  // Arrives as an ISO string once the event round-trips through the bus.
  occurredAt: z.union([z.string(), z.date()]),
  sourceId: z.string().nullish(),
})
export type MacMessageInPayload = z.infer<typeof macMessageInPayloadSchema>

export const reconcilePeriodInputSchema = z.object({
  workspaceId: z.string(),
  periodStart: z.string(),
})
export type ReconcilePeriodInput = z.infer<typeof reconcilePeriodInputSchema>
