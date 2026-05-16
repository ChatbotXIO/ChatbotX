import { messageAnalyticsService } from "@chatbotx.io/analytics"
import type {
  BotMessageSentEventPayload,
  HumanMessageSentEventPayload,
} from "@chatbotx.io/event-bus"

export function handleHumanMessageSent(
  payloads: HumanMessageSentEventPayload[],
): Promise<void> {
  return messageAnalyticsService.recordEvents(payloads, "message_human_sent")
}

export function handleBotMessageSent(
  payloads: BotMessageSentEventPayload[],
): Promise<void> {
  return messageAnalyticsService.recordEvents(payloads, "message_bot_sent")
}
