import { z } from "zod"
import { triggerContextSchema } from "./trigger-context"

export const botMessageResponseTypeSchema = z.enum([
  "AUTOMATED_RESPONSE",
  "AI_AGENT",
  "FLOW",
  "NONE",
])
export type BotMessageResponseType = z.infer<
  typeof botMessageResponseTypeSchema
>

export const botMessageRouteTypeSchema = z.enum(["FLOW", "AGENT", "FALLBACK"])
export type BotMessageRouteType = z.infer<typeof botMessageRouteTypeSchema>

export const botMessageResultSchema = z.enum(["SUCCESS", "FALLBACK"])
export type BotMessageResult = z.infer<typeof botMessageResultSchema>

export const botMessageFallbackReasonSchema = z.enum([
  "NO_INTENT_MATCH",
  "LOW_CONFIDENCE",
  "ROUTE_GUARD_BLOCKED",
  "NO_CONTENT",
  "NOT_FROM_CONTACT",
  "NO_AI_AGENT",
  "BUTTON_NOT_FOUND",
  "HANDLER_ERROR_TO_FALLBACK",
  "UNSUPPORTED_MESSAGE_TYPE",
])
export type BotMessageFallbackReason = z.infer<
  typeof botMessageFallbackReasonSchema
>

export const botMessageMetadataSchema = z.object({
  flowId: z.string().optional(),
  automatedResponseId: z.string().optional(),
  intentId: z.string().optional(),
  intentConfidence: z.number().optional(),
  fallbackReason: botMessageFallbackReasonSchema.optional(),
  latency: z.number().optional(),
  triggerContext: triggerContextSchema.optional(),
})

export type BotMessageMetadata = z.infer<typeof botMessageMetadataSchema>

export const botMessageEventSchema = z.object({
  aiProvider: z.string(),
  channel: z.string().optional(),
  chatbotId: z.string(),
  conversationId: z.string(),
  eventId: z.string(),
  hasResponse: z.boolean(),
  messageId: z.string(),
  metadata: botMessageMetadataSchema.optional(),
  occurredAt: z.coerce.date(),
  responseType: botMessageResponseTypeSchema,
  result: botMessageResultSchema.optional(),
  routeType: botMessageRouteTypeSchema.optional(),
  source: z.string().optional(),
})
export type BotMessageEvent = z.infer<typeof botMessageEventSchema>

export const createBotMessageEventSchema = botMessageEventSchema.omit({
  eventId: true,
})
export type CreateBotMessageEvent = z.infer<typeof createBotMessageEventSchema>

export const botMessageStatsSchema = z.object({
  aiProvider: z.string(),
  chatbotId: z.string(),
  count: z.number(),
  hasResponse: z.boolean(),
  responseType: botMessageResponseTypeSchema,
  result: botMessageResultSchema.optional(),
  routeType: botMessageRouteTypeSchema.optional(),
  timestamp: z.coerce.date(),
})
export type BotMessageStats = z.infer<typeof botMessageStatsSchema>

export const getMessagesStatsResponseSchema = z.object({
  data: z.array(botMessageStatsSchema),
})
export type GetMessagesStatsResponseSchema = z.infer<
  typeof getMessagesStatsResponseSchema
>

export const botMessageAIProviderStatsSchema = z.object({
  aiProvider: z.string(),
  count: z.number(),
  percentage: z.number(),
})
export type BotMessageAIProviderStats = z.infer<
  typeof botMessageAIProviderStatsSchema
>

export const getBotMessagesAIProvidersResponseSchema = z.object({
  data: z.array(botMessageAIProviderStatsSchema),
})
export type GetBotMessagesAIProvidersResponseSchema = z.infer<
  typeof getBotMessagesAIProvidersResponseSchema
>
