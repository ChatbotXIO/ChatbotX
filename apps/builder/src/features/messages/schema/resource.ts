import { createSelectSchema, messageModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { attachmentResource } from "@/features/attachments/schema/resource"
import { contactResource } from "@/features/contacts/schema/resource"
import { userResource } from "@/features/users/schema/resource"

export const messageResource = createSelectSchema(messageModel, {
  id: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  contactInboxId: z.string(),
  // `z.coerce.date()` accepts a real `Date` (every server-side caller
  // selecting straight from the DB) exactly like `z.date()` would, but also
  // accepts the ISO string a `Date` becomes after a JSON.stringify/parse
  // round trip — e.g. a realtime `messageCreated` wire frame. Without this,
  // parsing that wire payload against this schema rejects every message.
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).and(
  z.object({
    clientId: zodBigintAsString().optional(),
  }),
)
export type MessageResource = z.infer<typeof messageResource>

export const messageResourceWithRelations = messageResource.and(
  z.object({
    attachmentCount: z.number().optional(),
    attachments: z.array(attachmentResource).optional(),
    user: userResource.optional(),
    contact: contactResource.optional(),
    clientId: zodBigintAsString().optional(),
  }),
)
export type MessageResourceWithRelations = z.infer<
  typeof messageResourceWithRelations
>
