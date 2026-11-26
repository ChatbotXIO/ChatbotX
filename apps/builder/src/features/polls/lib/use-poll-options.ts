"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

/** Workspace polls as select options, for the "Voted on the poll" condition. */
export function usePollOptions({ enabled = true } = {}) {
  const workspaceId = useWorkspaceId()
  const query = useQuery({
    ...orpc.pollsAPI.listPollOptionsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
    }),
    enabled: enabled && Boolean(workspaceId),
  })
  // Memoize on the query data itself: a fresh `?? []` each render would
  // rebuild the options (and every filter config downstream) while loading.
  const polls = query.data?.data
  const options = useMemo(
    () => (polls ?? []).map((poll) => ({ label: poll.name, value: poll.id })),
    [polls],
  )
  return { options, isLoading: query.isLoading }
}
