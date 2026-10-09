import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Invalidates every Google Ads read plus the generic connections reads the
 * account picker polls. Await it BEFORE `router.refresh()` / `router.push()`
 * (AGENTS.md invariant 21): the refresh only re-renders the RSC tree and never
 * touches the browser-singleton QueryClient.
 */
export const useInvalidateGoogleAds = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.googleAdsAPI.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.connectionsAPI.key() }),
        queryClient.invalidateQueries({
          queryKey: orpc.connectSessionsAPI.key(),
        }),
      ]),
    [queryClient],
  )
}
