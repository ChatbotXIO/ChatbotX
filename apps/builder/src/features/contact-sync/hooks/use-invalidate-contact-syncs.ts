import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Call after anything that changes contact-sync data (a run, a mapping, or a
 * source connected / disconnected) so every reader refetches.
 */
export const useInvalidateContactSyncs = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: orpc.contactSyncAPIs.key() }),
    [queryClient],
  )
}
