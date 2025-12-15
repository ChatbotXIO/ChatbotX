import { BroadcastInboxType } from "@aha.chat/database/enums"
import { z } from "zod"

export const listConversationsRequest = z.object({
  chatbotId: z.cuid2().optional(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
  assignedUserId: z.string().nullable().optional(),
  inboxType: z.union([z.enum(BroadcastInboxType), z.literal("all")]).optional(),
  status: z.string().optional(),
  searchText: z.string().optional(),
  conversationType: z
    .enum({
      bot: "bot",
      human: "human",
      all: "all",
    })
    .optional(),
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>

export type FindConversationSchema = {
  id: string
  chatbotId: string
}
