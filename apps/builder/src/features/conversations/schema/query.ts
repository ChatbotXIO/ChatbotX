import {
  channelTypes,
  conversationBotCategories,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contact-filter/schema"
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
  /**
   * Absent when the channel cannot tell us when the post was published —
   * TikTok's caption and timestamp sit behind a scope the app does not hold, so
   * its card carries the author and the link and nothing else.
   */
  createdAt?: string
  link?: string
}

/**
 * The channels whose comment conversations can describe the post they sit on.
 *
 * Shared by the client (which skips the request entirely for anything else) and
 * `getPostDetailsQuery` (which rejects it), so the two cannot drift — before
 * this existed, an unlisted channel fell through to the Messenger branch and
 * asked the Graph API about an id it had never issued.
 */
const POST_DETAILS_CHANNELS = [
  "messenger",
  "instagram",
  "threads",
  "tiktok",
] as const

type PostDetailsChannel = (typeof POST_DETAILS_CHANNELS)[number]

export function supportsPostDetails(
  channel: string | undefined,
): channel is PostDetailsChannel {
  return POST_DETAILS_CHANNELS.includes(channel as PostDetailsChannel)
}
