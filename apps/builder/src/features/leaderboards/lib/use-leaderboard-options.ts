"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

/** Workspace leaderboards as select options, shared by the flow step and the condition field. */
export function useLeaderboardOptions({ enabled = true } = {}) {
  const workspaceId = useWorkspaceId()
  const query = useQuery({
    ...orpc.leaderboardsAPI.listLeaderboardOptionsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
    }),
    enabled: enabled && Boolean(workspaceId),
  })
  const leaderboards = query.data?.data ?? []
  const options = useMemo(
    () =>
      leaderboards.map((leaderboard) => ({
        label: leaderboard.name,
        value: leaderboard.id,
      })),
    [leaderboards],
  )
  return { leaderboards, options, isLoading: query.isLoading }
}
