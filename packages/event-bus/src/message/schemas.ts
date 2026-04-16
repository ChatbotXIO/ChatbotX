import { z } from "zod"
import { MessageEventType } from "./types"

const broadcastMetadata = z.object({
  type: z.literal("broadcast"),
  broadcastId: z.string(),
})

const sequenceScheduleMetadata = z.object({
  type: z.literal("sequenceSchedule"),
  sequenceScheduleId: z.string(),
})

export const messageSourceMetadataSchema = z.discriminatedUnion("type", [
  broadcastMetadata,
  sequenceScheduleMetadata,
])

const basePayloadSchema = z.object({
  chatbotId: z.string(),
  contactId: z.string(),
  conversationId: z.string(),
  channel: z.string(),
  occurredAt: z.date(),
  metadata: messageSourceMetadataSchema.optional(),
  messageId: z.string().optional(),
  messageDetail: z.record(z.string(), z.unknown()).optional(),
})

export const sentPayloadSchema = basePayloadSchema.extend({})
export const failedPayloadSchema = basePayloadSchema.extend({
  errorData: z.unknown(),
})
export const deliveredPayloadSchema = basePayloadSchema.extend({})
export const seenPayloadSchema = basePayloadSchema.extend({})

export const messageEventSchemas = {
  [MessageEventType.SENT]: sentPayloadSchema,
  [MessageEventType.FAILED]: failedPayloadSchema,
  [MessageEventType.DELIVERED]: deliveredPayloadSchema,
  [MessageEventType.SEEN]: seenPayloadSchema,
} as const
