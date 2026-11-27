import type { InfiniteData } from "@tanstack/react-query"
import type {
  ConversationParticipantResource,
  ListConversationParticipantsResponse,
} from "../schema/resource"

const byNewestReply = (
  left: ConversationParticipantResource,
  right: ConversationParticipantResource,
): number =>
  right.lastRepliedAt.getTime() - left.lastRepliedAt.getTime() ||
  (right.userId > left.userId ? 1 : -1)

/**
 * Applies one member's reply to a newest-first participants list. Idempotent
 * and order-independent, like the server's monotonic upsert: a duplicate or an
 * older reply returns the same list reference, so nothing re-renders. `limit`
 * caps a preview (the conversation row); omit it for a full list.
 */
export const mergeParticipantReply = (
  participants: readonly ConversationParticipantResource[],
  reply: ConversationParticipantResource,
  limit?: number,
): readonly ConversationParticipantResource[] => {
  const current = participants.find(
    (participant) => participant.userId === reply.userId,
  )
  if (
    current &&
    current.lastRepliedAt.getTime() >= reply.lastRepliedAt.getTime()
  ) {
    return participants
  }
  const merged = [
    reply,
    ...participants.filter(
      (participant) => participant.userId !== reply.userId,
    ),
  ].sort(byNewestReply)
  return limit === undefined ? merged : merged.slice(0, limit)
}

/**
 * Applies a reply to the cached participants pages: the member moves to the
 * top of the first page and is removed from every later page, so paging never
 * shows them twice.
 */
export const mergeParticipantReplyIntoPages = (
  data: InfiniteData<ListConversationParticipantsResponse, string | undefined>,
  reply: ConversationParticipantResource,
): InfiniteData<ListConversationParticipantsResponse, string | undefined> => {
  const [firstPage, ...laterPages] = data.pages
  if (!firstPage) {
    return data
  }
  // Monotonic over every cached page: a member who already has a newer (or the
  // same) reply on a later page is not moved back by a stale or duplicate event.
  const isKnownAsNewer = data.pages.some((page) =>
    page.data.some(
      (participant) =>
        participant.userId === reply.userId &&
        participant.lastRepliedAt.getTime() >= reply.lastRepliedAt.getTime(),
    ),
  )
  if (isKnownAsNewer) {
    return data
  }
  const merged = mergeParticipantReply(firstPage.data, reply)
  return {
    ...data,
    pages: [
      { ...firstPage, data: [...merged] },
      ...laterPages.map((page) => ({
        ...page,
        data: page.data.filter(
          (participant) => participant.userId !== reply.userId,
        ),
      })),
    ],
  }
}
