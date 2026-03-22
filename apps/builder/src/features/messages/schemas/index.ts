import { createSelectSchema, messageModel } from "@aha.chat/database/schema"
import type { MessageModel } from "@aha.chat/database/types"
import z from "zod"
import {
  type AttachmentResource,
  attachmentResource,
} from "@/features/attachments/schemas"
import type { BaseCursorCollection } from "@/features/common/schemas/pagination"
import {
  type ContactResource,
  contactResource,
} from "@/features/contacts/schemas/resource"
import {
  type UserResource,
  userResource,
} from "@/features/users/schemas/resource"

export const messageResource = createSelectSchema(messageModel).and(
  z.object({
    clientId: z.string().optional(),
  }),
)
export const messageResourceWithRelations = messageResource.and(
  z.object({
    attachments: z.array(attachmentResource),
    user: userResource.optional(),
    contact: contactResource.optional(),
  }),
)
export type MessageResourceWithRelations = z.infer<
  typeof messageResourceWithRelations
>

export type MessageResource = MessageModel & {
  user?: UserResource
  contact?: ContactResource
  attachments?: AttachmentResource[]
  clientId?: string
}
export type MessageCollection = BaseCursorCollection<MessageResource>
