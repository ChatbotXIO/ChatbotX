import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

const api = orpc.facebookMarketingMessagesAPI

/**
 * The Statistics tab lists campaign rows from our DB, so call after campaign
 * create / update / delete (invariant 21).
 */
export const useInvalidateMarketingMessagesStatistics = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: api.getMarketingMessagesStatisticsAPI.key(),
      }),
    [queryClient],
  )
}
