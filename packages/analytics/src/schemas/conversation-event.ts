import { z } from "zod"

export const conversationEventTypeSchema = z.enum([
  "conversation_created",
  "conversation_assigned",
  "conversation_unassigned",
])
export type ConversationEventType = z.infer<typeof conversationEventTypeSchema>

export const conversationEventSchema = z.object({
  channel: z.string().optional(),
  chatbotId: z.string(),
  conversationId: z.string(),
  eventId: z.string(),
  eventType: conversationEventTypeSchema,
  fromAssignee: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.date(),
  toAssignee: z.string().optional(),
})
export type ConversationEvent = z.infer<typeof conversationEventSchema>

export const createConversationEventSchema = conversationEventSchema.extend({
  eventId: z.string(),
})
export type CreateConversationEvent = z.infer<
  typeof createConversationEventSchema
>

export const conversationHandoffStatsSchema = z.object({
  chatbotId: z.string(),
  count: z.number(),
  direction: z.enum(["to_human", "to_bot"]),
  timestamp: z.date(),
})
export type ConversationHandoffStats = z.infer<
  typeof conversationHandoffStatsSchema
>

export const getConversationHandoffsResponseSchema = z.object({
  data: z.array(conversationHandoffStatsSchema),
})
export type GetConversationHandoffsResponse = z.infer<
  typeof getConversationHandoffsResponseSchema
>
