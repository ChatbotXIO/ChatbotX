import type { ChatbotResource } from "@/features/chatbots/schemas"
import type { UserResource } from "@/features/users/schemas"
import { BaseException } from "@/lib/error"
import type { ChatbotMemberModel } from "@ahachat.ai/database/types"

export type ChatbotMemberResource = ChatbotMemberModel & {
  chatbot?: ChatbotResource
  user?: UserResource
}

export type ChatbotMemberCollection = {
  data: ChatbotMemberResource[]
  pageCount: number
}

export class ChatbotMemberException extends BaseException {}
