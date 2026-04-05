import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const conversationEventTypeSchema = z.enum([
  "conversation_created",
  "conversation_assigned",
  "conversation_unassigned",
  "conversation_transferred_to_human",
  "conversation_transferred_to_bot",
  "conversation_followed",
  "conversation_unfollowed",
  "conversation_archived",
  "conversation_unarchived",
])
export type ConversationEventType = z.infer<typeof conversationEventTypeSchema>

export const conversationEventSchema = z.object({
  channel: z.string().optional(),
  workspaceId: zodBigintAsString(),
  conversationId: zodBigintAsString(),
  eventId: zodBigintAsString(),
  eventType: conversationEventTypeSchema,
  fromAssignee: zodBigintAsString().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.date(),
  toAssignee: zodBigintAsString().optional(),
})
export type ConversationEvent = z.infer<typeof conversationEventSchema>

export const createConversationEventSchema = conversationEventSchema.extend({
  eventId: zodBigintAsString(),
})
export type CreateConversationEvent = z.infer<
  typeof createConversationEventSchema
>

export const conversationHandoffStatsSchema = z.object({
  workspaceId: z.string(),
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

export const conversationFollowUpStatsSchema = z.object({
  workspaceId: z.string(),
  count: z.number(),
  timestamp: z.date(),
})
export type ConversationFollowUpStats = z.infer<
  typeof conversationFollowUpStatsSchema
>

export const getConversationFollowUpsResponseSchema = z.object({
  data: z.array(conversationFollowUpStatsSchema),
})
export type GetConversationFollowUpsResponse = z.infer<
  typeof getConversationFollowUpsResponseSchema
>

export const conversationArchivedStatsSchema = z.object({
  workspaceId: z.string(),
  count: z.number(),
  timestamp: z.date(),
})
export type ConversationArchivedStats = z.infer<
  typeof conversationArchivedStatsSchema
>

export const getConversationArchivedResponseSchema = z.object({
  data: z.array(conversationArchivedStatsSchema),
})
export type GetConversationArchivedResponse = z.infer<
  typeof getConversationArchivedResponseSchema
>

export const conversationAssignedStatsSchema = z.object({
  workspaceId: z.string(),
  count: z.number(),
  timestamp: z.date(),
})
export type ConversationAssignedStats = z.infer<
  typeof conversationAssignedStatsSchema
>

export const getConversationAssignedResponseSchema = z.object({
  data: z.array(conversationAssignedStatsSchema),
})
export type GetConversationAssignedResponse = z.infer<
  typeof getConversationAssignedResponseSchema
>

export const conversationAssignedByAdminStatsSchema = z.object({
  workspaceId: z.string(),
  toAssignee: z.string(),
  count: z.number(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
})
export type ConversationAssignedByAdminStats = z.infer<
  typeof conversationAssignedByAdminStatsSchema
>

export const getConversationAssignedByAdminResponseSchema = z.object({
  data: z.array(conversationAssignedByAdminStatsSchema),
})
export type GetConversationAssignedByAdminResponse = z.infer<
  typeof getConversationAssignedByAdminResponseSchema
>

export const uniqueConversationsByAdminStatsSchema = z.object({
  workspaceId: z.string(),
  toAssignee: z.string(),
  count: z.number(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
})
export type UniqueConversationsByAdminStats = z.infer<
  typeof uniqueConversationsByAdminStatsSchema
>

export const getUniqueConversationsByAdminResponseSchema = z.object({
  data: z.array(uniqueConversationsByAdminStatsSchema),
})
export type GetUniqueConversationsByAdminResponse = z.infer<
  typeof getUniqueConversationsByAdminResponseSchema
>
