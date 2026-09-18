"use client"

import { useEffect, useState } from "react"

/** How often the on-screen countdown/timer re-renders — cosmetic only, the
 * server enforces the real deadline/duration. */
const TICK_MS = 250

/**
 * Seconds remaining until `deadlineAt`, clamped at zero, re-rendered on a
 * tick while `deadlineAt` is set. Shared by `WhatsappCallPanel` (the single
 * call slot's countdown) and `WhatsappRingingCallsList` (one independent
 * countdown per basket entry) — never duplicated.
 */
export function useCountdownSeconds(deadlineAt: string | undefined): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!deadlineAt) {
      return
    }
    const interval = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(interval)
  }, [deadlineAt])

  if (!deadlineAt) {
    return 0
  }
  const deadlineMs = new Date(deadlineAt).getTime()
  // `deadlineAt` arrives from a realtime event payload and a server action, so
  // an unparseable value is possible; `NaN` would otherwise render literally
  // as "NaNs" in the countdown. Zero reads as "expiring now", which is the
  // honest thing to show when the deadline is unknown.
  if (!Number.isFinite(deadlineMs)) {
    return 0
  }
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000))
}
