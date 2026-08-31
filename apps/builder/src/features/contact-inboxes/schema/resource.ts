import {
  contactInboxModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const contactInboxResource = createSelectSchema(contactInboxModel, {
  id: z.string(),
  contactId: z.string(),
  inboxId: z.string(),
  channel: z.string(),
  contactLastReadAt: z.date().nullable().optional(),
  // Nullish (not just nullable): payloads serialized before the
  // sourceUserId/sourceUsername migration lack these keys entirely.
  sourceUserId: z.string().nullish(),
  sourceUsername: z.string().nullish(),
})
  .pick({
    id: true,
    contactId: true,
    inboxId: true,
    channel: true,
    source: true,
    sourceId: true,
    sourceUserId: true,
    sourceUsername: true,
    language: true,
    lastIncomingMessageAt: true,
    contactLastReadAt: true,
  })
  .extend({
    inbox: z.object({ name: z.string() }),
  })
export type ContactInboxResource = z.infer<typeof contactInboxResource>
