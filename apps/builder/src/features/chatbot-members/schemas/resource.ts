import type {
  ChatbotMemberModel,
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
  ChatbotMemberPermissions,
} from "@aha.chat/database/types"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import type { UserResource } from "@/features/users/schemas/resource"
import { BaseException } from "@/lib/errors/exception"

export type ChatbotMemberResource = ChatbotMemberModel & {
  permissions: ChatbotMemberPermissions
  notificationTypes: ChatbotMemberNotificationTypes
  notificationChannels: ChatbotMemberNotificationChannels
  chatbot?: ChatbotResource
  user?: UserResource
}

export type ChatbotMemberCollection = {
  data: ChatbotMemberResource[]
  pageCount: number
}

export class ChatbotMemberException extends BaseException {}
