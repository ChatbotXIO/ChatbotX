import {
  conversationModel,
  createSelectSchema,
} from "@aha.chat/database/schema"
import z from "zod"
import { inboxTeamResource } from "@/enterprise/features/inbox-teams/schemas/resource"
import { contactResource } from "@/features/contacts/schemas/resource"
import { inboxResource } from "@/features/inboxes/schemas/resource"
import { messageResource } from "@/features/messages/schemas"
import { userResource } from "@/features/users/schemas/resource"

export const conversationResource = createSelectSchema(conversationModel)
export type ConversationResource = z.infer<typeof conversationResource>

export const listConversationsItemResource = conversationResource.and(
  z.object({
    messages: z.array(messageResource),
    contact: contactResource.nullable(),
    inbox: inboxResource.nullable(),
    assignedUser: userResource.nullable(),
    assignedInboxTeam: inboxTeamResource.nullable(),
  }),
)
export type ListConversationItemResource = z.infer<
  typeof listConversationsItemResource
>

export const listConversationsResponse = z.object({
  data: z.array(listConversationsItemResource),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
})
export type ListConversationsResponse = z.infer<
  typeof listConversationsResponse
>

export const findConversationResponse = z.object({
  data: listConversationsItemResource,
})
export type FindConversationResponse = z.infer<typeof findConversationResponse>
