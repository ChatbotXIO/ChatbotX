import type { Contact, Conversation, Message } from "@ahachat.ai/database"
import type { User } from "next-auth"
import { createSearchParamsCache, parseAsString } from "nuqs/server"

export const getConversationsSearchParamsCache = createSearchParamsCache({
  conversationId: parseAsString,
})

export type CursorConversations = {
  updatedAt: Date | string
  id: string
}

export type GetConversationsSchema = {
  chatbotId: string
  perPage?: number
  cursor?: CursorConversations
}

export type GetCurrentConversationsSchema = {
  id: string
  chatbotId: string
}

export type ConversationResource = Conversation & {
  contact: Contact & {
    assignedUser: User | null
  }
  latestMessage: Message | null
  unreadCount: number
}
