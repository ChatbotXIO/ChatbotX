import type { AttachmentResource } from "@/features/attachments/schemas"
import type { BaseCursorCollection } from "@/features/common/schemas/pagination"
import type { ContactResource } from "@/features/contacts/schemas"
import type { UserResource } from "@/features/users/schemas"
import type { MessageModel } from "@ahachat.ai/database/types"

export type MessageResource = MessageModel & {
  user?: UserResource
  contact?: ContactResource
  attachments?: AttachmentResource[]
  clientId?: string
}
export type MessageCollection = BaseCursorCollection<MessageResource>
