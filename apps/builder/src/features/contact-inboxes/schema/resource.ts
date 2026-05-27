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
})
  .pick({
    id: true,
    contactId: true,
    inboxId: true,
    channel: true,
    sourceId: true,
  })
  .extend({
    // Inbox relation populada via Drizzle `with` quando query carrega
    // contactInboxes. Usado no composer pra mostrar o nome verificado do
    // business (ex: "Renato Silva") em vez do label genérico do canal.
    inbox: z
      .object({
        id: z.string(),
        name: z.string(),
        channel: z.string(),
      })
      .optional(),
  })
export type ContactInboxResource = z.infer<typeof contactInboxResource>
