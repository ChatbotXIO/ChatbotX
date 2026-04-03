import {
  chatbotMemberModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type { ChatbotMemberModel } from "@chatbotx.io/database/types"
import type {
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
  ChatbotMemberPermissions,
} from "@chatbotx.io/database/schema"
import z from "zod"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import {
  type UserResource,
  userResource,
} from "@/features/users/schemas/resource"

export const chatbotMemberResource = createSelectSchema(chatbotMemberModel)

export const publicListChatbotMembersResponse = z.object({
  data: z.array(chatbotMemberResource.and(z.object({ user: userResource }))),
  pageCount: z.number(),
})
export type PublicListChatbotMembersResponse = z.infer<
  typeof publicListChatbotMembersResponse
>

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
