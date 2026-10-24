import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

const api = orpc.facebookMarketingMessagesAPI

export const useAudiences = (workspaceId: string) =>
  useQuery(
    api.listMarketingMessagesAudiencesAPI.queryOptions({
      input: { workspaceId },
      select: (res) => res.audiences,
    }),
  )

/** Disabled while the grant is expired — it can only fail then. */
export const useAudiencesLive = (workspaceId: string, enabled: boolean) =>
  useQuery(
    api.listMarketingMessagesAudiencesLiveAPI.queryOptions({
      input: { workspaceId },
      enabled,
      select: (res) => res.statuses,
    }),
  )

/** Call after create / upload more / delete (invariant 21). */
export const useInvalidateMarketingMessagesAudiences = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: api.listMarketingMessagesAudiencesAPI.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: api.listMarketingMessagesAudiencesLiveAPI.key(),
        }),
      ]),
    [queryClient],
  )
}
