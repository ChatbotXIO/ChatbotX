"use client"

import { useCallbackRef } from "@chatbotx.io/ui/hooks/use-callback-ref"
import { useEffect, useState } from "react"

const MILLISECONDS_PER_SECOND = 1000

type UseAutoSubmitCountdownParams = {
  /** Flip to true once the deferred submit is ready to run. */
  active: boolean
  seconds: number
  onElapsed: () => void
}

/**
 * Counts down from `seconds` once `active` turns true, then fires `onElapsed`
 * exactly once. The returned value is what a disabled button should render, so
 * the user can see why the UI is waiting instead of staring at a dead control.
 *
 * Two timers on purpose: the deadline is a single `setTimeout`, so the callback
 * still fires on time when a slow frame drops an interval tick, and the interval
 * only drives the visible label.
 */
export function useAutoSubmitCountdown({
  active,
  seconds,
  onElapsed,
}: UseAutoSubmitCountdownParams): number {
  const [secondsLeft, setSecondsLeft] = useState(seconds)
  // Stable identity, so the timer effect never restarts — and never pushes the
  // deadline out — just because the caller passed a fresh closure this render.
  const handleElapsed = useCallbackRef(onElapsed)

  useEffect(() => {
    if (!active) {
      setSecondsLeft(seconds)
      return
    }

    const tick = window.setInterval(() => {
      setSecondsLeft((previous) => Math.max(0, previous - 1))
    }, MILLISECONDS_PER_SECOND)

    const deadline = window.setTimeout(() => {
      window.clearInterval(tick)
      setSecondsLeft(0)
      handleElapsed()
    }, seconds * MILLISECONDS_PER_SECOND)

    return () => {
      window.clearTimeout(deadline)
      window.clearInterval(tick)
    }
  }, [active, seconds, handleElapsed])

  return secondsLeft
}
