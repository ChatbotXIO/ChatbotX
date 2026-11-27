"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { useInvalidateAfterTemplateChange } from "../lib/use-invalidate-template-kinds"

const REFRESH_INTERVAL_MS = 3000

/**
 * Polls the server component tree via `router.refresh()` while any
 * installation on this page is still `pending`/`installing`. Renders
 * nothing — purely a side-effect component, unmounted by the parent once
 * every row has settled (see `hasPendingWork` in
 * `template-installs-table.tsx`), so the interval naturally stops. A hidden
 * tab skips its ticks and refreshes once when it becomes visible again.
 *
 * `router.refresh()` never reaches the TanStack cache, and an install, retry,
 * sync or uninstall that just settled has locked, unlocked or removed copies:
 * the cached lock badges, template lists and resource lists (30s stale time)
 * are dropped on unmount, so newly installed or synced rows show up.
 */
export function InstallProgressRefresher() {
  const router = useRouter()
  const { invalidateLocks, invalidateAll } = useInvalidateAfterTemplateChange()
  const invalidateLocksRef = useRef(invalidateLocks)
  invalidateLocksRef.current = invalidateLocks
  const invalidateAllRef = useRef(invalidateAll)
  invalidateAllRef.current = invalidateAll

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }
    const interval = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS)
    document.addEventListener("visibilitychange", refreshIfVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", refreshIfVisible)
      // Fire and forget: a failed refetch only leaves a badge stale, and the
      // write paths refuse locked edits anyway.
      invalidateLocksRef.current().catch(() => undefined)
      invalidateAllRef.current()
    }
  }, [router])

  return null
}
