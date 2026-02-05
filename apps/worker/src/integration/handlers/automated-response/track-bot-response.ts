import {
  type BotMessageAIProvider,
  type BotMessageFallbackReason,
  type BotMessageResponseType,
  type BotMessageResult,
  botMessageTrackingService,
} from "@aha.chat/analytics"

interface TrackBotResponseParams {
  chatbotId: string
  conversationId: string
  messageId: string
  hasResponse: boolean
  responseType: BotMessageResponseType
  result?: BotMessageResult
  aiProvider: BotMessageAIProvider
  metadata?: {
    flowId?: string
    intentId?: string
    intentConfidence?: number
    fallbackReason?: BotMessageFallbackReason
  }
  startTime: number
}

export async function trackBotResponse(params: TrackBotResponseParams) {
  try {
    await botMessageTrackingService.trackEvent({
      chatbotId: params.chatbotId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      occurredAt: new Date(),
      hasResponse: params.hasResponse,
      responseType: params.responseType,
      result: params.result,
      aiProvider: params.aiProvider,
      metadata: {
        ...params.metadata,
        latency: Date.now() - params.startTime,
      },
    })
  } catch (error) {
    console.error("[trackBotResponse] Failed to track bot response:", error)
  }
}
