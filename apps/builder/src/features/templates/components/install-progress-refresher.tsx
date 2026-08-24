"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const REFRESH_INTERVAL_MS = 3000

/**
 * Polls the server component tree via `router.refresh()` while any
 * installation on this page is still `pending`/`installing`. Renders
 * nothing — purely a side-effect component, unmounted by the parent once
 * every row has settled (see `hasPendingWork` in
 * `template-installs-table.tsx`), so the interval naturally stops.
 */
export function InstallProgressRefresher() {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [router])

  return null
}
