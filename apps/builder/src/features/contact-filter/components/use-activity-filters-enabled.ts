"use client"

import { useQuery } from "@tanstack/react-query"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

const ACTIVITY_AVAILABILITY_STALE_TIME_MS = 5 * 60 * 1000

/**
 * Whether the activity-backed filters are switched on server-side. Assumed on
 * until the answer arrives so the picker does not flicker; the server fails a
 * disabled field closed regardless of what the UI offers.
 */
export const useActivityFiltersEnabled = (): boolean => {
  const workspaceId = useWorkspaceId()
  const { data } = useQuery(
    orpc.contactFilterAPI.getActivityAvailabilityAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId),
      staleTime: ACTIVITY_AVAILABILITY_STALE_TIME_MS,
    }),
  )
  return data?.enabled ?? true
}
