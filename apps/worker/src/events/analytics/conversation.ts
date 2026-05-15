import { conversationAnalyticsService } from "@chatbotx.io/analytics"
import type { AnalyticsDashboardEvent } from "@chatbotx.io/event-bus"

type ConversationAnalyticsPayload = Extract<
  AnalyticsDashboardEvent,
  { eventType: `conversation:${string}` }
>

export function handleConversationCreated(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_created",
  )
}

export function handleConversationAssigned(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_assigned",
  )
}

export function handleConversationUnassigned(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_unassigned",
  )
}

export function handleConversationTransferredToHuman(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_transferred_to_human",
  )
}

export function handleConversationTransferredToBot(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_transferred_to_bot",
  )
}

export function handleConversationFollowed(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_followed",
  )
}

export function handleConversationUnfollowed(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_unfollowed",
  )
}

export function handleConversationArchived(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_archived",
  )
}

export function handleConversationUnarchived(
  payloads: ConversationAnalyticsPayload[],
): Promise<void> {
  return conversationAnalyticsService.recordEvents(
    payloads,
    "conversation_unarchived",
  )
}
