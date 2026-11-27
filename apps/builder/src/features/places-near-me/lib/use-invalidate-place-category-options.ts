import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Call after any place category create/update/delete so the flow editor's
 * category select refetches. `router.refresh()` does not touch the TanStack
 * cache (AGENTS.md invariant 21).
 */
export const useInvalidatePlaceCategoryOptions = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.placesNearMeAPI.listPlaceCategoryOptionsAPI.key(),
      }),
    [queryClient],
  )
}
