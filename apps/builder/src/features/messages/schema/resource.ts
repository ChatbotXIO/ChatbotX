import { createSelectSchema, messageModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { attachmentResource } from "@/features/attachments/schema/resource"
import { contactResource } from "@/features/contacts/schemas/resource"
import { userResource } from "@/features/users/schemas/resource"

export const messageResource = createSelectSchema(messageModel, {
  id: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  contactInboxId: z.string(),
}).and(
  z.object({
    clientId: zodBigintAsString().optional(),
  }),
)
export type MessageResource = z.infer<typeof messageResource>

export const messageResourceWithRelations = messageResource.and(
  z.object({
    attachments: z.array(attachmentResource).optional(),
    user: userResource.optional(),
    contact: contactResource.optional(),
    clientId: zodBigintAsString().optional(),
  }),
)
export type MessageResourceWithRelations = z.infer<
  typeof messageResourceWithRelations
>
