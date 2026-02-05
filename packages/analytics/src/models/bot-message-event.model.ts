export type BotMessageResponseType =
  | "automated_response"
  | "ai_agent"
  | "flow"
  | "none"

export type BotMessageResult = "success" | "fallback"

export type BotMessageAIProvider = "openai" | "gemini" | "none"

export type BotMessageFallbackReason =
  | "NO_INTENT_MATCH"
  | "LOW_CONFIDENCE"
  | "ROUTE_GUARD_BLOCKED"
  | "HANDLER_ERROR_TO_FALLBACK"
  | "UNSUPPORTED_MESSAGE_TYPE"

export interface BotMessageEvent {
  eventId: string
  chatbotId: string
  messageId: string
  conversationId: string
  occurredAt: Date

  hasResponse: boolean
  responseType: BotMessageResponseType
  result?: BotMessageResult
  aiProvider: BotMessageAIProvider

  channel?: string
  source?: string
  metadata?: {
    flowId?: string
    intentId?: string
    intentConfidence?: number
    fallbackReason?: BotMessageFallbackReason
    latency?: number
  }
}

export type CreateBotMessageEvent = Omit<BotMessageEvent, "eventId">

export interface BotMessageStats {
  chatbotId: string
  timestamp: Date
  hasResponse: boolean
  responseType: BotMessageResponseType
  result?: BotMessageResult
  aiProvider: BotMessageAIProvider
  count: number
}

export interface BotMessageAIProviderStats {
  aiProvider: BotMessageAIProvider
  count: number
  percentage: number
}
