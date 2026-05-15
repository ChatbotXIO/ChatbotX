import { contactAnalyticsService } from "@chatbotx.io/analytics"
import type {
  BotMessageSentEventPayload,
  ContactCreatedEventPayload,
  ContactDeletedEventPayload,
  HumanMessageSentEventPayload,
} from "@chatbotx.io/event-bus"

export function handleContactCreated(
  payloads: ContactCreatedEventPayload[],
): Promise<void> {
  return contactAnalyticsService.recordEvents(payloads, "contact_created")
}

export function handleContactDeleted(
  payloads: ContactDeletedEventPayload[],
): Promise<void> {
  return contactAnalyticsService.recordEvents(payloads, "contact_deleted")
}

export function handleHumanMessageSent(
  payloads: HumanMessageSentEventPayload[],
): Promise<void> {
  return contactAnalyticsService.recordEvents(payloads, "message_human_sent")
}

export function handleBotMessageSent(
  payloads: BotMessageSentEventPayload[],
): Promise<void> {
  return contactAnalyticsService.recordEvents(payloads, "message_bot_sent")
}
