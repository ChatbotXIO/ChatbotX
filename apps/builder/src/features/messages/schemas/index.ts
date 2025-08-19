import type { MessageModel } from "@aha.chat/database/types"
import type { AttachmentResource } from "@/features/attachments/schemas"
import type { BaseCursorCollection } from "@/features/common/schemas/pagination"
import type { ContactResource } from "@/features/contacts/schemas"
import type { UserResource } from "@/features/users/schemas"

export type MessageResource = MessageModel & {
  user?: UserResource
  contact?: ContactResource
  attachments?: AttachmentResource[]
  clientId?: string
}
export type MessageCollection = BaseCursorCollection<MessageResource>
