import { z } from "zod"

export const contactEventTypeSchema = z.enum([
  "contact_created",
  "contact_deleted",
  "contact_message_in",
  "contact_message_out",
])
export type ContactEventType = z.infer<typeof contactEventTypeSchema>

export const contactSenderTypeSchema = z.enum(["bot", "human", ""])
export type ContactSenderType = z.infer<typeof contactSenderTypeSchema>

export const contactEventSchema = z.object({
  adminId: z.bigint().optional(),
  channel: z.string().optional(),
  chatbotId: z.bigint(),
  contactId: z.bigint(),
  country: z.string().optional(),
  eventId: z.bigint(),
  eventType: contactEventTypeSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.date(),
  senderType: contactSenderTypeSchema.optional(),
  source: z.string().nullish(),
  sourceId: z.string().nullish(),
})
export type ContactEvent = z.infer<typeof contactEventSchema>

export type CreateContactEvent = Omit<ContactEvent, "eventId">
