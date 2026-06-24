import {
  channelTypes,
  conversationBotCategories,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/contact-filter"
import { cursorPaginationRequest } from "@/lib/pagination"

export const listConversationsRequest = z.object({
  workspaceId: zodBigintAsString(),
  botCategory: conversationBotCategories.optional(),
  assignedId: z.string().nullable().optional(),
  channel: z.union([channelTypes]).optional(),
  status: z.array(conversationStatuses).optional(),
  keyword: z.string().optional(),
  botEnabled: z.boolean().nullish(),
  tags: z
    .array(
      z.enum(["noAdminReply", "unread", "followUp", "archived", "blocked"]),
    )
    .optional(),
  contactFilter: contactFilterRequest.shape.contactFilter.optional(),
  ...cursorPaginationRequest.shape,
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>

export type PostDetails = {
  text?: string
  picture?: string
  from?: { id: string; name: string }
  createdAt: string
  link?: string
}
