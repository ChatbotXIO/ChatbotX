import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { triggerContextSchema } from "./trigger-context"

export const trackingResponseTypes = z.enum([
  "automated_response",
  "ai_agent",
  "flow",
  "none",
])
export type TrackingResponseType = z.infer<typeof trackingResponseTypes>

export const botMessageRouteTypes = z.enum(["flow", "agent", "fallback"])
export type BotMessageRouteType = z.infer<typeof botMessageRouteTypes>

export const botMessageResults = z.enum(["success", "fallback"])
export type BotMessageResult = z.infer<typeof botMessageResults>

export const botMessageFallbackReasons = z.enum([
  "no_content",
  "no_intent_match",
  "low_confidence",
  "route_guard_blocked",
  "no_content",
  "not_from_contact",
  "no_ai_agent",
  "button_not_found",
  "handler_error_to_fallback",
  "unsupported_message_type",
])
export type BotMessageFallbackReason = z.infer<typeof botMessageFallbackReasons>

export const botMessageMetadataSchema = z.object({
  flowId: zodBigintAsString().optional(),
  automatedResponseId: zodBigintAsString().optional(),
  intentId: z.string().optional(),
  intentConfidence: z.number().optional(),
  fallbackReason: botMessageFallbackReasons.optional(),
  latency: z.number().optional(),
  triggerContext: triggerContextSchema.optional(),
})

export type BotMessageMetadata = z.infer<typeof botMessageMetadataSchema>

export const botMessageEventSchema = z.object({
  aiProvider: z.string(),
  channel: z.string().optional(),
  workspaceId: zodBigintAsString(),
  conversationId: zodBigintAsString(),
  eventId: zodBigintAsString(),
  hasResponse: z.boolean(),
  messageId: zodBigintAsString(),
  metadata: botMessageMetadataSchema.optional(),
  occurredAt: z.coerce.date(),
  responseType: trackingResponseTypes,
  result: botMessageResults.optional(),
  routeType: botMessageRouteTypes.optional(),
  source: z.string().optional(),
})
export type BotMessageEvent = z.infer<typeof botMessageEventSchema>

export const createBotMessageEventSchema = botMessageEventSchema.omit({
  eventId: true,
})
export type CreateBotMessageEvent = z.infer<typeof createBotMessageEventSchema>

export const botMessageStatsSchema = z.object({
  aiProvider: z.string(),
  workspaceId: z.string(),
  count: z.number(),
  hasResponse: z.boolean(),
  responseType: trackingResponseTypes,
  result: botMessageResults.optional(),
  routeType: botMessageRouteTypes.optional(),
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
