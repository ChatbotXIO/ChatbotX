import {
  contactsOnSequenceModel,
  conversationModel,
  createSelectSchema,
  sequenceModel,
} from "@aha.chat/database/schema"
import z from "zod"
import { inboxTeamResource } from "@/enterprise/features/inbox-teams/schema"
import { contactResource } from "@/features/contacts/schemas/resource"
import { inboxResource } from "@/features/inboxes/schemas/resource"
import { messageResource } from "@/features/messages/schemas"
import { userResource } from "@/features/users/schemas/resource"

export const conversationResource = createSelectSchema(conversationModel)
export type ConversationResource = z.infer<typeof conversationResource>

const contactsOnSequenceResource = createSelectSchema(contactsOnSequenceModel)
const sequenceResourceSchema = createSelectSchema(sequenceModel)

export const listConversationsItemResource = conversationResource.and(
  z.object({
    messages: z.array(messageResource),
    contact: contactResource
      .extend({
        contactsOnSequences: z.array(
          contactsOnSequenceResource.extend({
            sequence: sequenceResourceSchema,
          }),
        ),
      })
      .nullable(),
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
