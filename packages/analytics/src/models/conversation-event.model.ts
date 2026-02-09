export type ConversationEventType =
  | "conversation_created"
  | "conversation_assigned"
  | "conversation_unassigned"

export interface ConversationEvent {
  eventId: string
  chatbotId: string
  conversationId: string
  eventType: ConversationEventType
  occurredAt: Date
  fromAssignee?: string
  toAssignee?: string
  channel?: string
  metadata?: Record<string, unknown>
}

export interface CreateConversationEvent
  extends Omit<ConversationEvent, "eventId"> {}

export interface ConversationHandoffStats {
  chatbotId: string
  timestamp: Date
  direction: "to_human" | "to_bot"
  count: number
}
