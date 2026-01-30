import { ConversationStatus, ConversationType } from "@aha.chat/database/enums"
import { InboxType, Omnichannel } from "@aha.chat/database/types"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/query"

export const listConversationsRequest = z.object({
  chatbotId: z.cuid2().optional(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
  assignedUserId: z.string().nullable().optional(),
  inboxType: z.union([z.enum(InboxType), z.literal(Omnichannel)]).optional(),
  status: z.array(z.enum(ConversationStatus)).optional(),
  searchText: z.string().optional(),
  conversationType: z.enum(ConversationType).optional(),
  contactFilter: contactFilterRequest.shape.contactFilter.optional(),
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>

export type FindConversationSchema = {
  id: string
  chatbotId: string
}
