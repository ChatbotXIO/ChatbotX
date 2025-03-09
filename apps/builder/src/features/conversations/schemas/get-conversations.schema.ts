import type { BaseCursorCollection } from "@/features/common/schemas/pagination"
import type {
  Contact,
  Conversation,
  Inbox,
  InboxTeam,
  Message,
  User,
} from "@ahachat.ai/database"
import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { z } from "zod"

export const listConversationsSearchParams = createSearchParamsCache({
  conversationId: parseAsString,
})

export const listConversationsRequest = z.object({
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>

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
  inbox?: Inbox
  _count?: {
    messages?: number
  }
}

export type ConversationCollection = BaseCursorCollection<ConversationResource>
