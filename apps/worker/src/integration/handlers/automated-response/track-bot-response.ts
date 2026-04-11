import {
  botMessageTrackingService,
  type TrackBotRequest,
  type TrackingResponseType,
} from "@chatbotx.io/analytics"
import type { BotResponseTrackingContext } from "@chatbotx.io/worker-config"

export function createTrackingContext(params: {
  messageId: string
  workspaceId: string
  conversationId: string
  responseType: TrackingResponseType
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
      workspaceId: params.workspaceId,
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
