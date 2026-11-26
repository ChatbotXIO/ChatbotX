import type { ChannelPostSyncStatus } from "@chatbotx.io/database/partials"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { orpc } from "@/lib/orpc/query"
import {
  hasActiveSync,
  type SyncMarkers,
  syncCompletedSince,
  syncJustSettled,
  syncMarkersOf,
} from "../lib/sync-polling"

type SyncStatusRow = {
  inboxId?: string
  lastSyncedAt?: Date | null
  status: ChannelPostSyncStatus
}

/** Refreshes the posts list once a sync is over: one seen running, or one whose completion time moved unseen. */
export const useRefreshWhenSyncSettles = (
  items: readonly SyncStatusRow[] | undefined,
): void => {
  const queryClient = useQueryClient()
  const wasActive = useRef(false)
  const markers = useRef<SyncMarkers | null>(null)
  useEffect(() => {
    if (items === undefined) {
      return
    }
    if (
      syncJustSettled(wasActive.current, items) ||
      syncCompletedSince(markers.current, items)
    ) {
      queryClient.invalidateQueries({
        queryKey:
          orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.key(),
      })
    }
    wasActive.current = hasActiveSync(items)
    markers.current = syncMarkersOf(items)
  }, [items, queryClient])
}
