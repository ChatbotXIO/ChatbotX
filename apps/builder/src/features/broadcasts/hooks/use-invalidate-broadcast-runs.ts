"use client"

import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"
import { getQueryClient } from "@/lib/query/query-client"

/**
 * Pausing, resuming, editing or deleting a repeating broadcast changes what
 * its runs page lists, and that page's TanStack cache outlives navigation, so
 * every such mutation refreshes both run queries.
 */
export function useInvalidateBroadcastRuns() {
  return useCallback(() => {
    const queryClient = getQueryClient()
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.broadcastAPIs.privateListBroadcastRunGroupsAPI.key(),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.broadcastAPIs.privateListBroadcastOccurrencesAPI.key(),
      }),
    ])
  }, [])
}
