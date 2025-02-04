import type {
  BaseCursorCollection,
  CursorPagination,
} from "@/features/common/types"
import type { Attachment, Message } from "@ahachat.ai/database"
import type { User } from "next-auth"

export type GetMessagesSchema = {
  chatbotId: string
  conversationId: string
  perPage?: number
  cursor?: CursorPagination | null
}

export type MessageResource = Message & {
  user?: User
  attachments?: Attachment[]
}

export type MessageCollection = BaseCursorCollection<MessageResource>
