import type { BotResponseTrackingContext } from "@aha.chat/worker-config"
import {
  type BotMessageResponseType,
  botMessageTrackingService,
  type TrackBotRequest,
} from "@chatbotx.io/analytics"

export function createTrackingContext(params: {
  messageId: string
  chatbotId: string
  conversationId: string
  responseType: BotMessageResponseType
  aiProvider: string
  triggerType: string
}): BotResponseTrackingContext {
  return {
    ...params,
    startTime: Date.now(),
  }
}

export async function trackBotResponse(params: TrackBotRequest) {
  try {
    await botMessageTrackingService.trackEvent({
      chatbotId: params.chatbotId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      occurredAt: new Date(),
      hasResponse: params.hasResponse,
      responseType: params.responseType,
      routeType: params.routeType,
      result: params.result,
      aiProvider: params.aiProvider,
      metadata: {
        ...params.metadata,
        latency: Date.now() - params.startTime,
        triggerContext: params.triggerContext,
      },
    })
  } catch (error) {
    console.error("[trackBotResponse] Failed to track bot response:", error)
  }
}
