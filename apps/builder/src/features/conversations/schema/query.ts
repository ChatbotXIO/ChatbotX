import { ConversationStatus } from "@aha.chat/database/enums"
import { channelTypes } from "@aha.chat/database/schema"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/query"

export const listConversationsRequest = z.object({
  chatbotId: z.bigint(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
  assignedId: z.string().nullable().optional(),
  channel: z.union([channelTypes]).optional(),
  status: z.array(z.enum(ConversationStatus)).optional(),
  keyword: z.string().optional(),
  liveChatEnabled: z.boolean().nullish(),
  tags: z
    .array(
      z.enum(["noAdminReply", "unread", "followUp", "archived", "blocked"]),
    )
    .optional(),
  contactFilter: contactFilterRequest.shape.contactFilter.optional(),
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>
