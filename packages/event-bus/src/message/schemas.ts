import { metadataSchema } from "@chatbotx.io/flow-config"
import { z } from "zod"
import { MessageEventType } from "./types"

const basePayloadSchema = z.object({
  workspaceId: z.string(),
  contactId: z.string(),
  conversationId: z.string(),
  channel: z.string(),
  contactInboxId: z.string().optional(),
  sourceId: z.string().optional(),
  occurredAt: z.date(),
  metadata: metadataSchema.optional(),
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
