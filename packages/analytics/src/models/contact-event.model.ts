export type ContactEventType =
  | "contact_created"
  | "contact_deleted"
  | "contact_message_in"
  | "contact_message_out"

export interface ContactEvent {
  eventId: string
  chatbotId: string
  contactId: string
  eventType: ContactEventType
  occurredAt: Date
  source?: string
  sourceId?: string
  channel?: string
  country?: string
  metadata?: Record<string, unknown>
}

export type CreateContactEvent = Omit<ContactEvent, "eventId">
