"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Drops every cached leaderboard picker list (participants switcher, flow
 * step, condition field) so they refetch after a create/update/delete or a
 * status change. Call it alongside `router.refresh()` (invariant 21).
 */
export function useInvalidateLeaderboards() {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.leaderboardsAPI.listLeaderboardOptionsAPI.key(),
      }),
    [queryClient],
  )
}
