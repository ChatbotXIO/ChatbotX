"use client"

import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { orpc } from "@/lib/orpc/query"
import { socialPostListQueryKeys } from "../lib/social-post-query-keys"

/** Realtime bursts (a post with many targets settling) collapse into one refetch, never held longer than the cap. */
const REFETCH_DEBOUNCE_MS = 400
const REFETCH_MAX_WAIT_MS = 2000

/**
 * The reads a post change can alter: the list and its counts (which the calendar
 * pages through as well), a post's detail on the edit page, and the channel
 * post list a published post lands in. Only mounted queries refetch.
 */
const socialPostQueryKeys = () => [
  ...socialPostListQueryKeys(),
  orpc.socialPostsAPIs.privateGetSocialPostAPI.key(),
  // A published post becomes (or refreshes) a row of the "On channels" list.
  orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.key(),
]

/**
 * Keeps the post list, the edit page and the calendar current: a
 * `socialPostChanged` realtime event (a publish settling, a retry, a schedule
 * change made elsewhere) refetches them.
 */
export function useSocialPostRealtimeSync(): void {
  const queryClient = useQueryClient()
  const refetch = useDebouncedCallback(
    () => {
      for (const queryKey of socialPostQueryKeys()) {
        queryClient.invalidateQueries({ queryKey })
      }
    },
    REFETCH_DEBOUNCE_MS,
    REFETCH_MAX_WAIT_MS,
  )
  useWorkspaceRealtimeEvents({ socialPostChanged: () => refetch() })
}
