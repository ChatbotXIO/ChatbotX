import type { BotMessageResponseType } from "@chatbotx.io/analytics"

export interface BotResponseTrackingContext {
  aiProvider: string
  chatbotId: bigint
  conversationId: bigint
  messageId: bigint
  responseType: BotMessageResponseType
  startTime: number
  triggerType: string
}
