import { contactTrackingService } from "@chatbotx.io/analytics"
import type { CreateContactEvent } from "@chatbotx.io/analytics/schemas"
import type { ContactEvenTypeMap, ContactPayload } from "@chatbotx.io/event-bus"
import { contactEventTypeSchema } from "@chatbotx.io/flow-config"

function toCreateContactEvent(
  payload: ContactPayload,
  eventType: CreateContactEvent["eventType"],
): CreateContactEvent {
  const occurredAt =
    payload.occurredAt instanceof Date
      ? payload.occurredAt
      : new Date(payload.occurredAt)

  return {
    workspaceId: payload.workspaceId,
    contactId: payload.contactId,
    eventType,
    occurredAt,
    adminId: payload.adminId,
    channel: payload.channel ?? undefined,
    country: payload.country ?? undefined,
    metadata: payload.metadata,
    senderType: payload.senderType,
    source: payload.source ?? undefined,
    sourceId: payload.sourceId ?? undefined,
  }
}

async function trackContactEvents(
  payloads: ContactPayload[],
  eventType: CreateContactEvent["eventType"],
): Promise<void> {
  const events = payloads.map((p) => toCreateContactEvent(p, eventType))
  await contactTrackingService.trackEventsBatch(events)
}

export const contactListeners: Partial<ContactEvenTypeMap> = {
  [contactEventTypeSchema.enum["contact:created"]]: [
    {
      name: "contact-created-tracking",
      handler: (payloads) => trackContactEvents(payloads, "contact_created"),
    },
  ],
  [contactEventTypeSchema.enum["contact:deleted"]]: [
    {
      name: "contact-deleted-tracking",
      handler: (payloads) => trackContactEvents(payloads, "contact_deleted"),
    },
  ],
}
