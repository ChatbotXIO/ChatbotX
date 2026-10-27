import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Call after any pipeline create/update/delete/move so every reader refetches.
 * `router.refresh()` does not touch the TanStack cache (AGENTS.md invariant 21).
 */
export const useInvalidatePipelines = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.pipelinesAPI.key() }),
    [queryClient],
  )
}
