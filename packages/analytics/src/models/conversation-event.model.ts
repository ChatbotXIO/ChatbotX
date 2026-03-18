export type ConversationEventType =
  | "conversation_created"
  | "conversation_assigned"
  | "conversation_unassigned"

export interface ConversationEvent {
  channel?: string
  chatbotId: string
  conversationId: string
  eventId: string
  eventType: ConversationEventType
  fromAssignee?: string
  metadata?: Record<string, unknown>
  occurredAt: Date
  toAssignee?: string
}

export interface CreateConversationEvent
  extends Omit<ConversationEvent, "eventId"> {}

export interface ConversationHandoffStats {
  chatbotId: string
  count: number
  direction: "to_human" | "to_bot"
  timestamp: Date
}
