import type { AttachmentResource } from "@/features/attachments/schemas/get-attachments.schema"
import type { BaseCursorCollection } from "@/features/common/schemas/pagination"
import type { ContactResource } from "@/features/contacts/schemas/get-contacts-schema"
import type { Message } from "@ahachat.ai/database"
import type { User } from "next-auth"
import { z } from "zod"

export const listMessagesRequest = z.object({
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
  conversationId: z.string().cuid2().optional(),
})
export type ListMessagesRequest = z.infer<typeof listMessagesRequest>

export type MessageResource = Message & {
  user?: User
  contact?: ContactResource
  attachments?: AttachmentResource[]
  clientId?: string
}
export type MessageCollection = BaseCursorCollection<MessageResource>
