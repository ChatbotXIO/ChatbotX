import { botMessageAnalyticsService } from "@chatbotx.io/analytics"
import type { MessageBotReceivedEventPayload } from "@chatbotx.io/event-bus"

export function handleMessageBotReceived(
  payloads: MessageBotReceivedEventPayload[],
): Promise<void> {
  return botMessageAnalyticsService.recordEvents(payloads)
}
