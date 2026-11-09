"use client"

import { useEffect, useRef } from "react"

/**
 * Closes a confirmation dialog once the action it started has settled, on
 * success or failure alike: a failure keeps its toast and the agent can
 * reopen the dialog to retry. It never closes on open, only on the
 * `isExecuting` true -> false edge.
 */
export function useCloseWhenSettled(
  isExecuting: boolean,
  onOpenChange: (open: boolean) => void,
): void {
  const wasExecutingRef = useRef(false)
  useEffect(() => {
    if (wasExecutingRef.current && !isExecuting) {
      onOpenChange(false)
    }
    wasExecutingRef.current = isExecuting
  }, [isExecuting, onOpenChange])
}
