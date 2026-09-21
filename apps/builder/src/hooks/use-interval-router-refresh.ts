"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Re-runs the current route's server components on an interval while
 * `enabled`, so a server-rendered list catches up with background work
 * (worker jobs, cron) without a manual reload. Skips ticks while the tab is
 * hidden and stops as soon as `enabled` turns false.
 */
export function useIntervalRouterRefresh(input: {
  enabled: boolean
  intervalMs: number
}): void {
  const router = useRouter()
  const { enabled, intervalMs } = input

  useEffect(() => {
    if (!enabled) {
      return
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }, intervalMs)
    return () => clearInterval(timer)
  }, [enabled, intervalMs, router])
}
