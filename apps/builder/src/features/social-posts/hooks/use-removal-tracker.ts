"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ComposerPost } from "../lib/composer-state"

/** How long to wait, after one read of the post answered, before the next one. */
export const REMOVAL_POLL_INTERVAL_MS = 3000
/** After this long the tracker gives up (the realtime events still refresh the page). */
export const REMOVAL_POLL_CAP_MS = 60_000

/**
 * A target's removal ended when it is removed or carries an error. Asking for a
 * removal clears the earlier error on the server, so an error seen after the
 * tracker's first read belongs to this attempt, even when its text repeats.
 */
const hasEnded = (
  target: ComposerPost["targets"][number] | undefined,
  armed: boolean,
): boolean => {
  if (!target || target.removedAt) {
    return true
  }
  return armed && target.errorCode !== null
}

/**
 * Follows the destinations whose removal was queued: a worker finishes them
 * later, and the page must not depend on a realtime event to learn it. While
 * any of them is still open, `refetch` runs again 3 s after the previous read
 * answered (one read at a time, so a slow answer is never cancelled), for at
 * most 60 s; the timers are cleared when all end or on unmount.
 */
export const useRemovalTracker = ({
  post,
  refetch,
}: {
  post: ComposerPost
  /** Resolves `true` only when the read succeeded and brought fresh data. */
  refetch: () => Promise<boolean>
}): { removing: ReadonlySet<string>; track: (ids: string[]) => void } => {
  const [tracked, setTracked] = useState<readonly string[]>([])
  const [session, setSession] = useState(0)
  // Set after the first read that follows the request: only then is an error on the row new.
  const [armed, setArmed] = useState(false)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  const track = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      return
    }
    setTracked((current) => [...new Set([...current, ...ids])])
    setArmed(false)
    setSession((value) => value + 1)
  }, [])

  // Drop what ended as the post refreshes.
  useEffect(() => {
    setTracked((current) => {
      const open = current.filter(
        (id) =>
          !hasEnded(
            post.targets.find((item) => item.id === id),
            armed,
          ),
      )
      return open.length === current.length ? current : open
    })
  }, [post, armed])

  const isTracking = tracked.length > 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: `session` restarts the loop and the 60 s cap on every new request
  useEffect(() => {
    if (!isTracking) {
      return
    }
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      timer = setTimeout(async () => {
        let fresh = false
        try {
          fresh = await refetchRef.current()
        } catch {
          // The next round tries again; the cap ends it.
        }
        if (stopped) {
          return
        }
        // Only a successful read can show this attempt's error; a failed one keeps waiting.
        if (fresh) {
          setArmed(true)
        }
        schedule()
      }, REMOVAL_POLL_INTERVAL_MS)
    }
    schedule()
    const cap = setTimeout(() => setTracked([]), REMOVAL_POLL_CAP_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
      clearTimeout(cap)
    }
  }, [isTracking, session])

  return { removing: new Set(tracked), track }
}
