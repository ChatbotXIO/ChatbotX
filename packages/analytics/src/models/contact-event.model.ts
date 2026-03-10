export type ContactEventType =
  | "contact_created"
  | "contact_deleted"
  | "contact_message_in"
  | "contact_message_out"

export type ContactSenderType = "bot" | "human" | ""

export interface ContactEvent {
  channel?: string
  chatbotId: string
  contactId: string
  country?: string
  eventId: string
  eventType: ContactEventType
  metadata?: Record<string, unknown> & {
    triggerContext?: {
      triggerSource: string
      triggerHandler: string
      triggerType: string
    }
  }
  occurredAt: Date
  senderType?: ContactSenderType
  source?: string
  sourceId?: string
}

export type CreateContactEvent = Omit<ContactEvent, "eventId">
