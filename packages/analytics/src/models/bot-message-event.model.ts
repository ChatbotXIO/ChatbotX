export type BotMessageResponseType =
  | "automated_response"
  | "ai_agent"
  | "flow"
  | "none"

export type BotMessageRouteType = "FLOW" | "AGENT" | "FALLBACK"

export type BotMessageResult = "success" | "fallback"

export type BotMessageAIProvider = "openai" | "gemini" | "none"

export type BotMessageFallbackReason =
  | "NO_INTENT_MATCH"
  | "LOW_CONFIDENCE"
  | "ROUTE_GUARD_BLOCKED"
  | "NO_CONTENT"
  | "NOT_FROM_CONTACT"
  | "NO_AI_AGENT"
  | "BUTTON_NOT_FOUND"
  | "HANDLER_ERROR_TO_FALLBACK"
  | "UNSUPPORTED_MESSAGE_TYPE"

export interface BotMessageEvent {
  aiProvider: BotMessageAIProvider

  channel?: string
  chatbotId: string
  conversationId: string
  eventId: string

  hasResponse: boolean
  messageId: string
  metadata?: {
    flowId?: string
    automatedResponseId?: string
    intentId?: string
    intentConfidence?: number
    fallbackReason?: BotMessageFallbackReason
    latency?: number
    triggerContext?: {
      triggerSource: string
      triggerHandler: string
      triggerType: string
    }
  }
  occurredAt: Date
  responseType: BotMessageResponseType
  result?: BotMessageResult
  routeType?: BotMessageRouteType
  source?: string
}

export type CreateBotMessageEvent = Omit<BotMessageEvent, "eventId">

export interface BotMessageStats {
  aiProvider: BotMessageAIProvider
  chatbotId: string
  count: number
  hasResponse: boolean
  responseType: BotMessageResponseType
  result?: BotMessageResult
  routeType?: BotMessageRouteType
  timestamp: Date
}

export interface BotMessageAIProviderStats {
  aiProvider: BotMessageAIProvider
  count: number
  percentage: number
}
