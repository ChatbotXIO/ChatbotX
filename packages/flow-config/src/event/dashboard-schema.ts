import { z } from "zod"
import {
  botMessageResponseTypeSchema,
  botMessageResultSchema,
  botMessageRouteTypeSchema,
  contactSenderTypeSchema,
} from "./schema"

export const analyticsDashboardEventTypeSchema = z.enum([
  "contact:created",
  "contact:deleted",
  "message:human_sent",
  "message:bot_sent",
  "conversation:created",
  "conversation:assigned",
  "conversation:unassigned",
  "conversation:transferred_to_human",
  "conversation:transferred_to_bot",
  "conversation:followed",
  "conversation:unfollowed",
  "conversation:archived",
  "conversation:unarchived",
  "message:bot_received",
])
export type AnalyticsDashboardEventType = z.infer<
  typeof analyticsDashboardEventTypeSchema
>

const baseContactEventPayloadSchema = z.object({
  workspaceId: z.string(),
  contactId: z.string(),
  occurredAt: z.union([z.date(), z.string(), z.number()]),
  adminId: z.string().optional(),
  channel: z.string().nullish(),
  country: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  senderType: contactSenderTypeSchema.optional(),
  source: z.string().nullish(),
  sourceId: z.string().nullish(),
})

export const contactCreatedEventSchema = baseContactEventPayloadSchema.extend({
  eventType: z.literal("contact:created"),
})
export type ContactCreatedEventPayload = z.infer<
  typeof contactCreatedEventSchema
>

export const contactDeletedEventSchema = baseContactEventPayloadSchema.extend({
  eventType: z.literal("contact:deleted"),
})
export type ContactDeletedEventPayload = z.infer<
  typeof contactDeletedEventSchema
>

export const humanMessageSentEventSchema = baseContactEventPayloadSchema.extend(
  {
    eventType: z.literal("message:human_sent"),
  },
)
export type HumanMessageSentEventPayload = z.infer<
  typeof humanMessageSentEventSchema
>

export const botMessageSentEventSchema = baseContactEventPayloadSchema.extend({
  eventType: z.literal("message:bot_sent"),
})
export type BotMessageSentEventPayload = z.infer<
  typeof botMessageSentEventSchema
>

const baseConversationEventPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  occurredAt: z.union([z.date(), z.string(), z.number()]),
  fromAssignee: z.string().optional(),
  toAssignee: z.string().optional(),
  channel: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const conversationCreatedEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:created"),
  })

export const conversationAssignedEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:assigned"),
  })

export const conversationUnassignedEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:unassigned"),
  })

export const conversationTransferredToHumanEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:transferred_to_human"),
  })

export const conversationTransferredToBotEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:transferred_to_bot"),
  })

export const conversationFollowedEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:followed"),
  })

export const conversationUnfollowedEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:unfollowed"),
  })

export const conversationArchivedEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:archived"),
  })

export const conversationUnarchivedEventSchema =
  baseConversationEventPayloadSchema.extend({
    eventType: z.literal("conversation:unarchived"),
  })

export const messageBotReceivedEventSchema = z.object({
  eventType: z.literal("message:bot_received"),
  workspaceId: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  occurredAt: z.union([z.date(), z.string(), z.number()]),
  hasResponse: z.boolean(),
  responseType: botMessageResponseTypeSchema.optional(),
  routeType: botMessageRouteTypeSchema.optional(),
  result: botMessageResultSchema.optional(),
  aiProvider: z.string().optional(),
  channel: z.string().optional(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type MessageBotReceivedEventPayload = z.infer<
  typeof messageBotReceivedEventSchema
>

export const analyticsDashboardEventSchema = z.discriminatedUnion("eventType", [
  contactCreatedEventSchema,
  contactDeletedEventSchema,
  humanMessageSentEventSchema,
  botMessageSentEventSchema,
  conversationCreatedEventSchema,
  conversationAssignedEventSchema,
  conversationUnassignedEventSchema,
  conversationTransferredToHumanEventSchema,
  conversationTransferredToBotEventSchema,
  conversationFollowedEventSchema,
  conversationUnfollowedEventSchema,
  conversationArchivedEventSchema,
  conversationUnarchivedEventSchema,
  messageBotReceivedEventSchema,
])
export type AnalyticsDashboardEvent = z.infer<
  typeof analyticsDashboardEventSchema
>

export type AnalyticsDashboardEventMap = {
  "analytics:dashboard": AnalyticsDashboardEvent
}

export const analyticsDashboardEventSchemas = {
  "analytics:dashboard": analyticsDashboardEventSchema,
} as const
