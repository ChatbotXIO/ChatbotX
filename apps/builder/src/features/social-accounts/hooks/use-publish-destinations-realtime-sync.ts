"use client"

import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { invalidatePublishDestinations } from "@/features/social-posts/lib/invalidate-publish-destinations"
import { changesPublishDestinations } from "../lib/destination-realtime"

const REFETCH_DEBOUNCE_MS = 400
const REFETCH_MAX_WAIT_MS = 2000

/**
 * Refetches the destinations (invariant 21) when a `socialPostChanged` event
 * that can change them arrives (the permission re-check wrote, or a target
 * failed); every other status is ignored before the debounce, so a busy
 * workspace's publishing never refetches the Connect tab.
 */
export function usePublishDestinationsRealtimeSync(): void {
  const queryClient = useQueryClient()
  const refetch = useDebouncedCallback(
    () => {
      invalidatePublishDestinations(queryClient)
    },
    REFETCH_DEBOUNCE_MS,
    REFETCH_MAX_WAIT_MS,
  )
  useWorkspaceRealtimeEvents({
    socialPostChanged: (event) => {
      if (changesPublishDestinations(event.data.status)) {
        refetch()
      }
    },
  })
}
