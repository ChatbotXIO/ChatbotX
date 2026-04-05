import {
  contactsOnSequenceModel,
  conversationModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { inboxTeamResource } from "@/enterprise/features/inbox-teams/schema/resource"
import { contactInboxResource } from "@/features/contact-inboxes/schema/resource"
import { contactResource } from "@/features/contacts/schemas/resource"
import { messageResource } from "@/features/messages/schema/resource"
import { sequenceResource } from "@/features/sequences/schema/resource"
import { userResource } from "@/features/users/schemas/resource"

export const conversationResource = createSelectSchema(conversationModel, {
  id: z.string(),
  contactId: z.string(),
  workspaceId: z.string(),
})
export type ConversationResource = z.infer<typeof conversationResource>

const contactsOnSequenceResource = createSelectSchema(contactsOnSequenceModel, {
  id: z.string(),
  contactId: z.string(),
  sequenceId: z.string(),
  workspaceId: z.string(),
})

export const listConversationsItemResource = conversationResource.and(
  z.object({
    contactInboxes: z.array(contactInboxResource),
    messages: z.array(messageResource),
    contact: contactResource
      .extend({
        contactsOnSequences: z.array(
          contactsOnSequenceResource.extend({
            sequence: sequenceResource,
          }),
        ),
      })
      .nullable(),
    // inbox: inboxResource.nullable(),
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

export const findConversationRequest = z.object({
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
export type FindConversationRequest = z.infer<typeof findConversationRequest>

export const findConversationResponse = z.object({
  data: listConversationsItemResource,
})
export type FindConversationResponse = z.infer<typeof findConversationResponse>
