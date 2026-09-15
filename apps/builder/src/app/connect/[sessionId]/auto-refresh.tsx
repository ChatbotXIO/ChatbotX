"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const POLL_INTERVAL_MS = 3000

/**
 * Re-renders the server component on an interval while a `ConnectSession`
 * is still `pending`/`awaiting_selection` — the API/MCP caller that started
 * the connect finishes it from their own side (exchanging the code, then
 * calling `connectTargets`), so this page has nothing to do but wait and
 * pick up the eventual `completed`/`failed` status. Stops re-rendering once
 * the page itself renders a terminal status (this component is only mounted
 * for the in-flight branch, so unmounting it — a fresh server render — ends
 * the polling naturally).
 */
export function ConnectSessionAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [router])

  return null
}
