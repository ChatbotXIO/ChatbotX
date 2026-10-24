import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Invalidates the cached product / category / vendor picker options read by
 * the Collection flow step and the purchase contact filters. Call it BEFORE
 * `router.refresh()` / `router.push()` after any product, category or vendor
 * mutation (AGENTS.md invariant 21): the refresh only re-renders the RSC tree
 * and never touches the browser-singleton QueryClient.
 */
export const useInvalidateProductFormOptions = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.productsAPI.listProductFormOptionsAPI.key(),
      }),
    [queryClient],
  )
}
