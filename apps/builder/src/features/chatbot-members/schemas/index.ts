import type { ChatbotMemberModel } from "@aha.chat/database/types"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import type { UserResource } from "@/features/users/schemas"
import { BaseException } from "@/lib/errors/exception"

export type ChatbotMemberResource = ChatbotMemberModel & {
  chatbot?: ChatbotResource
  user?: UserResource
}

export type ChatbotMemberCollection = {
  data: ChatbotMemberResource[]
  pageCount: number
}

export class ChatbotMemberException extends BaseException {}
