import type { ChatbotResource } from "@/features/chatbots/schemas"
import { BaseException } from "@/lib/error"
import type { ChatbotMember } from "@ahachat.ai/database"

export type ChatbotMemberResource = ChatbotMember & {
  chatbot?: ChatbotResource
}

export class ChatbotMemberException extends BaseException {}
