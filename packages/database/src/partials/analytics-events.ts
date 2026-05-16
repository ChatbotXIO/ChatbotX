import { z } from "zod"

export const analyticsContactEventTypes = z.enum([
  "contact_created",
  "contact_deleted",
])
export type AnalyticsContactEventType = z.infer<
  typeof analyticsContactEventTypes
>

export const analyticsMessageEventTypes = z.enum([
  "message_human_sent",
  "message_bot_sent",
])
export type AnalyticsMessageEventType = z.infer<
  typeof analyticsMessageEventTypes
>

export const analyticsContactSenderTypes = z.enum(["bot", "human"])
export type AnalyticsContactSenderType = z.infer<
  typeof analyticsContactSenderTypes
>

export const analyticsBotResponseTypes = z.enum([
  "automated_response",
  "ai_agent",
  "flow",
  "none",
])
export type AnalyticsBotResponseType = z.infer<typeof analyticsBotResponseTypes>

export const analyticsBotRouteTypes = z.enum(["flow", "agent", "fallback"])
export type AnalyticsBotRouteType = z.infer<typeof analyticsBotRouteTypes>

export const analyticsBotResults = z.enum(["success", "fallback"])
export type AnalyticsBotResult = z.infer<typeof analyticsBotResults>

export const analyticsConversationEventTypes = z.enum([
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
export type AnalyticsConversationEventType = z.infer<
  typeof analyticsConversationEventTypes
>

export const analyticsBroadcastEventTypes = z.enum([
  "message:sent",
  "message:delivered",
  "message:seen",
  "message:failed",
  "flow:clicked",
])
export type AnalyticsBroadcastEventType = z.infer<
  typeof analyticsBroadcastEventTypes
>
