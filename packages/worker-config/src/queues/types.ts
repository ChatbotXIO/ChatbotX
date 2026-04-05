import type { BotMessageResponseType } from "@chatbotx.io/analytics"

export interface BotResponseTrackingContext {
  aiProvider: string
  conversationId: string
  messageId: string
  responseType: BotMessageResponseType
  startTime: number
  triggerType: string
  workspaceId: string
}
