import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

/** `false` until known, so SLA-only UI stays hidden while it is off. */
export const useResponseSlaEnabled = (): boolean => {
  const workspaceId = useWorkspaceId()
  const { data } = useQuery(
    orpc.responseSlaAPI.getResponseSlaStatusWorkspaceAuthAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId),
    }),
  )
  return data?.enabled ?? false
}

/** Call after the SLA policy is saved so the inbox filter options refresh. */
export const useInvalidateResponseSlaStatus = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey:
          orpc.responseSlaAPI.getResponseSlaStatusWorkspaceAuthAPI.key(),
      }),
    [queryClient],
  )
}
