import type { Message } from "@ahachat.ai/database"
import type { User } from "next-auth"

export type CursorMessages = {
  createdAt: Date
  id: string
}

export type GetMessagesSchema = {
  chatbotId: string
  conversationId: string
  perPage?: number
  cursor?: CursorMessages | null
}

export type MessageResource = Message & {
  user: User
}
