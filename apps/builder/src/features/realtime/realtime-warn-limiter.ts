/**
 * Rate-limits `logger.warn` for malformed realtime frames/schema failures,
 * keyed per `reason` (+ `eventType` when known) so one failure kind never
 * suppresses another. Callers pass `now` explicitly for fake-timer tests.
 */

const WARN_LIMIT_PER_WINDOW = 5
const WARN_WINDOW_MS = 60_000

type LimiterWindow = {
  windowStartedAt: number
  count: number
  /**
   * Set once this window's single "further warnings suppressed" summary has
   * been emitted, so it's never repeated within the same window.
   */
  suppressionSummaryEmitted: boolean
}

const windowsByKey = new Map<string, LimiterWindow>()

export type RealtimeWarnDecision =
  /** Log the warning normally. */
  | { shouldLog: true; isSuppressionSummary: false }
  /**
   * Log ONE summary line noting that further warnings for this key are being
   * suppressed for the rest of the window.
   */
  | { shouldLog: true; isSuppressionSummary: true }
  /**
   * Do not log — already past the limit and the summary was already emitted for
   * this window.
   */
  | { shouldLog: false }

function buildKey(reason: string, eventType: string | undefined): string {
  return eventType ? `${reason}:${eventType}` : reason
}

/**
 * Windows are FIXED, not rolling: anchored at the key's first occurrence and
 * lasting `WARN_WINDOW_MS`. Within it: first `WARN_LIMIT_PER_WINDOW`
 * occurrences log, the next logs one suppression summary, the rest are
 * dropped until the anchor expires and a new window starts.
 */
export function decideRealtimeWarnLogging(
  reason: string,
  eventType: string | undefined,
  now: number = Date.now(),
): RealtimeWarnDecision {
  const key = buildKey(reason, eventType)
  let currentWindow = windowsByKey.get(key)

  if (!currentWindow || now - currentWindow.windowStartedAt >= WARN_WINDOW_MS) {
    currentWindow = {
      windowStartedAt: now,
      count: 0,
      suppressionSummaryEmitted: false,
    }
    windowsByKey.set(key, currentWindow)
  }

  currentWindow.count += 1

  if (currentWindow.count <= WARN_LIMIT_PER_WINDOW) {
    return { shouldLog: true, isSuppressionSummary: false }
  }
  if (!currentWindow.suppressionSummaryEmitted) {
    currentWindow.suppressionSummaryEmitted = true
    return { shouldLog: true, isSuppressionSummary: true }
  }
  return { shouldLog: false }
}

/**
 * Test-only: clears every tracked window so test files don't leak rate limiter
 * state into each other.
 */
export function resetRealtimeWarnLimiterForTests(): void {
  windowsByKey.clear()
}
