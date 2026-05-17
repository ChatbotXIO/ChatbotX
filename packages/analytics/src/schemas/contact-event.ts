import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const contactEventTypes = z.enum([
  "contact_created",
  "contact_deleted",
  "contact_blocked",
])
export type ContactEventType = z.infer<typeof contactEventTypes>

export const contactSenderTypes = z.enum(["bot", "human"])
export type ContactSenderType = z.infer<typeof contactSenderTypes>

export const contactEventSchema = z.object({
  adminId: zodBigintAsString().optional(),
  channel: z.string().optional(),
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
  country: z.string().optional(),
  eventId: zodBigintAsString(),
  eventType: contactEventTypes,
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.date(),
  senderType: contactSenderTypes.optional(),
  source: z.string().nullish(),
  sourceId: z.string().nullish(),
})
export type ContactEvent = z.infer<typeof contactEventSchema>

export type CreateContactEvent = Omit<ContactEvent, "eventId">
