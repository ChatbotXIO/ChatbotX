/**
 * Rate-limits `logger.warn` calls the workspace realtime provider makes for
 * malformed frames / schema failures — a misbehaving deploy or a single
 * chatty bad actor must not flood the logs with one warning per message.
 * Keyed per `reason` (+ `eventType` when known), so a burst of one kind of
 * failure never suppresses an unrelated one.
 *
 * Deterministic and side-effect-free apart from its own module-level
 * clock/state — callers pass `now` explicitly so tests can drive it with
 * fake timers instead of real wall-clock time.
 */

const WARN_LIMIT_PER_WINDOW = 5
const WARN_WINDOW_MS = 60_000

type LimiterWindow = {
  windowStartedAt: number
  count: number
  /** Set once this window's single "further warnings suppressed" summary
   * has been emitted, so it is never repeated within the same window. */
  suppressionSummaryEmitted: boolean
}

const windowsByKey = new Map<string, LimiterWindow>()

export type RealtimeWarnDecision =
  /** Log the warning normally. */
  | { shouldLog: true; isSuppressionSummary: false }
  /** Log ONE summary line noting that further warnings for this key are
   * being suppressed for the rest of the window. */
  | { shouldLog: true; isSuppressionSummary: true }
  /** Do not log — already past the limit and the summary was already
   * emitted for this window. */
  | { shouldLog: false }

function buildKey(reason: string, eventType: string | undefined): string {
  return eventType ? `${reason}:${eventType}` : reason
}

/**
 * Records one occurrence of `reason` (optionally scoped to `eventType`) and
 * decides whether the caller should log it. Windows are FIXED, not
 * rolling: a window starts at the first occurrence for a key (or the first
 * occurrence after the previous window elapsed) and lasts exactly
 * {@link WARN_WINDOW_MS} from that anchor, regardless of when later
 * occurrences land inside it. Within that fixed window: the first
 * {@link WARN_LIMIT_PER_WINDOW} occurrences log normally; the next
 * occurrence logs a single suppression summary; every occurrence after
 * that is silently dropped until the window's anchor time is exceeded,
 * at which point the next occurrence starts a brand new window and logs
 * normally again.
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

/** Test-only: clears every tracked window so test files don't leak rate
 * limiter state into each other. */
export function resetRealtimeWarnLimiterForTests(): void {
  windowsByKey.clear()
}
