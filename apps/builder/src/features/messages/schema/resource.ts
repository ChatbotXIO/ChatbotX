import { createSelectSchema, messageModel } from "@aha.chat/database/schema"
import z from "zod"
import { attachmentResource } from "@/features/attachments/schemas"
import { contactResource } from "@/features/contacts/schemas/resource"
import { userResource } from "@/features/users/schemas/resource"

export const messageResource = createSelectSchema(messageModel).and(
  z.object({
    clientId: z.bigint().optional(),
  }),
)
export type MessageResource = z.infer<typeof messageResource>

export const messageResourceWithRelations = messageResource.and(
  z.object({
    attachments: z.array(attachmentResource),
    user: userResource.optional(),
    contact: contactResource.optional(),
    clientId: z.bigint().optional(),
  }),
)
export type MessageResourceWithRelations = z.infer<
  typeof messageResourceWithRelations
>
