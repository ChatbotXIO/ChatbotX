import type { BotResponseTrackingContext } from "@chatbotx.io/worker-config"
import type { ReplyAIProvider } from "./replies"

// Mutable box for a tracking context that must be attached to at most one
// outbound message per AI run, regardless of whether that message comes from
// the `sendMessage` system tool (possibly invoked more than once across a
// multi-step tool loop) or the plain-text streaming reply.
export type TrackingContextRef = {
  current: BotResponseTrackingContext | undefined
}

export function consumeTrackingContext(
  ref: TrackingContextRef,
): BotResponseTrackingContext | undefined {
  const trackingContext = ref.current
  ref.current = undefined
  return trackingContext
}

export function buildTrackingContext(input: {
  conversationId: string
  messageId: string
  provider: ReplyAIProvider
  responseType: BotResponseTrackingContext["responseType"]
  startTime: number
  triggerType: string
  workspaceId: string
}): BotResponseTrackingContext {
  return {
    aiProvider: input.provider,
    conversationId: input.conversationId,
    messageId: input.messageId,
    responseType: input.responseType,
    startTime: input.startTime,
    triggerType: input.triggerType,
    workspaceId: input.workspaceId,
  }
}
