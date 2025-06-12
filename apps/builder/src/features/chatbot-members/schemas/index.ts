import type { ChatbotResource } from "@/features/chatbots/schemas"
import type { UserResource } from "@/features/users/schemas"
import { BaseException } from "@/lib/error"
import type { ChatbotMember } from "@ahachat.ai/database"

export type ChatbotMemberResource = ChatbotMember & {
  chatbot?: ChatbotResource
  user?: UserResource
}

export type ChatbotMemberCollection = {
  data: ChatbotMemberResource[]
  pageCount: number
}

export class ChatbotMemberException extends BaseException {}
