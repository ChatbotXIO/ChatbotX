import {
  channelTypes,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/query"

export const listConversationsRequest = z.object({
  workspaceId: zodBigintAsString(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
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
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>
