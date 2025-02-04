import type { CursorPagination } from "@/features/common/types"
import type {
  Contact,
  Conversation,
  Message,
  Team,
  User,
} from "@ahachat.ai/database"
import { createSearchParamsCache, parseAsString } from "nuqs/server"

export const getConversationsSearchParamsCache = createSearchParamsCache({
  conversationId: parseAsString,
})

export type ListConversationsSchema = {
  chatbotId: string
  perPage?: number
  cursor?: CursorPagination
}

export type FindConversationSchema = {
  id: string
  chatbotId: string
}

export type ConversationResource = Conversation & {
  messages?: Message[]
  contact?: Contact & {
    assignedUser: User | null
    assignedTeam: Team | null
  }
}

export type ConversationCollection = {
  data: ConversationResource[]
  nextCursor: CursorPagination | null
  prevCursor: CursorPagination | null
}
