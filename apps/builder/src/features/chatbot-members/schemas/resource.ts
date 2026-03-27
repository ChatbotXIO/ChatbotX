import type { ChatbotMemberModel } from "@aha.chat/database/types"
import type {
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
  ChatbotMemberPermissions,
} from "node_modules/@aha.chat/database/src/drizzle/schema/chatbot"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import type { UserResource } from "@/features/users/schemas/resource"

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
