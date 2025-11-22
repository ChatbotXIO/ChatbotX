import type {
  ChatbotMemberModel,
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
} from "@aha.chat/database/types"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import type { UserResource } from "@/features/users/schemas"
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

export type ChatbotMemberPermissions = {
  superAdmin: boolean
  analytics: boolean
  flows: boolean
  contacts: boolean
  onlyAssignedContacts: boolean
  emailAndPhone: boolean
  broadcast: boolean
  ecommerce: boolean
}
