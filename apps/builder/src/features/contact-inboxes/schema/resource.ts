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
}).pick({
  id: true,
  contactId: true,
  inboxId: true,
  channel: true,
})
export type ContactInboxResource = z.infer<typeof contactInboxResource>
