import type {
  BotMessageAIProvider,
  BotMessageResponseType,
} from "@aha.chat/analytics"

export interface BotResponseTrackingContext {
  aiProvider: BotMessageAIProvider
  chatbotId: string
  conversationId: string
  messageId: string
  responseType: BotMessageResponseType
  startTime: number
  triggerType: string
}
