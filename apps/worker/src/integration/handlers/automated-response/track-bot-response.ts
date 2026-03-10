import {
  type BotMessageAIProvider,
  type BotMessageFallbackReason,
  type BotMessageResponseType,
  type BotMessageResult,
  type BotMessageRouteType,
  botMessageTrackingService,
  type TriggerContext,
} from "@aha.chat/analytics"
import type { BotResponseTrackingContext } from "@aha.chat/worker-config"

interface TrackBotResponseParams {
  chatbotId: string
  conversationId: string
  messageId: string
  hasResponse: boolean
  responseType: BotMessageResponseType
  routeType?: BotMessageRouteType
  result?: BotMessageResult
  aiProvider: BotMessageAIProvider
  metadata?: {
    flowId?: string
    intentId?: string
    intentConfidence?: number
    fallbackReason?: BotMessageFallbackReason
  }
  startTime: number
  triggerContext?: TriggerContext
}

export function createTrackingContext(params: {
  messageId: string
  chatbotId: string
  conversationId: string
  responseType: BotMessageResponseType
  aiProvider: BotMessageAIProvider
  triggerType: string
}): BotResponseTrackingContext {
  return {
    ...params,
    startTime: Date.now(),
  }
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
