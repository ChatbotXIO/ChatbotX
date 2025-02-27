import type { BaseCursorCollection } from "@/features/common/types"
import type {
  Contact,
  Conversation,
  InboxTeam,
  Message,
  User,
} from "@ahachat.ai/database"
import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { z } from "zod"

export const listConversationsSearchParams = createSearchParamsCache({
  conversationId: parseAsString,
})

export const listConversationsSchema = z.object({
  chatbotId: z.string().cuid2().optional(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
})
export type ListConversationsSchema = z.infer<typeof listConversationsSchema>

export type FindConversationSchema = {
  id: string
  chatbotId: string
}

export type ConversationResource = Conversation & {
  messages?: Message[]
  contact?: Contact & {
    fullName: string
    assignedUser: User | null
    assignedTeam: InboxTeam | null
  }
  _count?: {
    messages?: number
  }
}

export type ConversationCollection = BaseCursorCollection<ConversationResource>
