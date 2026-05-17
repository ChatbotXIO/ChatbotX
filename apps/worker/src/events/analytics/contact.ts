import { contactAnalyticsService } from "@chatbotx.io/analytics"
import type {
  ContactBlockedEventPayload,
  ContactCreatedEventPayload,
  ContactDeletedEventPayload,
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

export function handleContactBlocked(
  payloads: ContactBlockedEventPayload[],
): Promise<void> {
  return contactAnalyticsService.recordEvents(payloads, "contact_blocked")
}
