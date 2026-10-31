"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { orpc } from "@/lib/orpc/query"

const REFRESH_INTERVAL_MS = 3000

/**
 * Polls the server component tree via `router.refresh()` while any
 * installation on this page is still `pending`/`installing`. Renders
 * nothing — purely a side-effect component, unmounted by the parent once
 * every row has settled (see `hasPendingWork` in
 * `template-installs-table.tsx`), so the interval naturally stops.
 *
 * `router.refresh()` never reaches the TanStack cache, and an install, retry,
 * sync or uninstall that just settled has locked, unlocked or removed copies:
 * the cached lock badges and template lists are dropped on unmount.
 */
export function InstallProgressRefresher() {
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, REFRESH_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      // The router key covers `listLockedIdsAPI` too. Fire and forget: a
      // failed refetch only leaves a badge stale, and the write paths refuse
      // locked edits anyway.
      queryClient
        .invalidateQueries({ queryKey: orpc.templatesAPI.key() })
        .catch(() => undefined)
    }
  }, [router, queryClient])

  return null
}
