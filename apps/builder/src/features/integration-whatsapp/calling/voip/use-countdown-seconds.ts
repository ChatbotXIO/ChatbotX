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
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000))
}
