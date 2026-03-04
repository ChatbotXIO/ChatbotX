import { ConversationStatus } from "@aha.chat/database/enums"
import { inboxType } from "@aha.chat/database/schema"
import { Omnichannel } from "@aha.chat/database/types"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contacts/schemas/query"

export const listConversationsRequest = z.object({
  chatbotId: z.cuid2().optional(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
  assignedId: z.string().nullable().optional(),
  inboxType: z
    .union([z.enum(inboxType.enumValues), z.literal(Omnichannel)])
    .optional(),
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

export type FindConversationSchema = {
  id: string
  chatbotId: string
}
