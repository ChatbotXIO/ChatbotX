import {
  channelTypes,
  conversationBotCategories,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/contact-filter"
import { cursorPaginationRequest } from "@/lib/pagination"

export const archiveFilters = z.enum(["open", "closed", "all"])
export type ArchiveFilter = z.infer<typeof archiveFilters>

export const sortOrders = z.enum(["asc", "desc"])
export type SortOrder = z.infer<typeof sortOrders>

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
  archiveFilter: archiveFilters.optional(),
  sortOrder: sortOrders.optional(),
  lifecycleStageId: z.string().nullable().optional(),
  contactFilter: contactFilterRequest.shape.contactFilter.optional(),
  ...cursorPaginationRequest.shape,
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>
