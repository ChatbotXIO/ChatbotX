import { useInfiniteQuery } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

const FIRST_PAGE: string | undefined = undefined

/**
 * The members who replied in a conversation, newest first, paged by cursor.
 * Shared by the hook and the realtime handler so both address the same cache
 * entry (`queryKey`).
 */
export const conversationParticipantsQueryOptions = (
  workspaceId: string,
  conversationId: string,
) =>
  orpc.conversationsAPI.listParticipantsAuthenticatedAPI.infiniteOptions({
    input: (cursor: string | undefined) => ({
      workspaceId,
      id: conversationId,
      cursor,
    }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

export const useConversationParticipants = (
  workspaceId: string,
  conversationId: string | undefined,
) =>
  useInfiniteQuery({
    ...conversationParticipantsQueryOptions(workspaceId, conversationId ?? ""),
    enabled: Boolean(workspaceId && conversationId),
  })
