import type { AutomationThrottleType } from "@chatbotx.io/database/partials"
import {
  claimAutomationThrottle,
  releaseAutomationThrottle,
} from "@chatbotx.io/database/repositories"
import { distributedStore } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"

/**
 * Redis fast-path marker TTL cap (seconds). Postgres remains the source of
 * truth for the real window; this only bounds how long a stale marker can
 * live before it self-expires and the next lookup re-consults Postgres. See
 * `docs/plans/default-reply-throttle-hybrid.md`.
 */
export const AUTOMATION_THROTTLE_FASTPATH_TTL_SECONDS = 300

/**
 * Outcome of {@link AutomationThrottleService.tryAcquire}:
 * - `acquired` — this caller created/renewed the claim (recording
 *   `lastTriggeredAt`); it owns the row and must
 *   {@link AutomationThrottleService.release} it if the follow-up work fails.
 *   An unbounded window (`windowSeconds` 0) always returns `acquired`: it
 *   records the trigger and always allows.
 * - `denied` — the window is still open (Redis fast-path hit, or Postgres said
 *   so); the caller must not proceed.
 * - `bypassed` — Postgres failed, so we fail open (allow) with no claim to
 *   release.
 */
export type AutomationThrottleClaim =
  | { result: "acquired"; claimId: string; remainingSeconds: number }
  | { result: "denied" }
  | { result: "bypassed" }

type ThrottleSubject = {
  workspaceId: string
  contactInboxId: string
  throttleType: AutomationThrottleType
  subjectId: string
}

/**
 * Redis fast-path key. The window is embedded so a setting change (e.g. an
 * `oncePerHour` → `oncePerDay` frequency edit) routes lookups to a fresh
 * namespace: every stale marker (positive or negative) is instantly
 * unreachable and self-expires within
 * {@link AUTOMATION_THROTTLE_FASTPATH_TTL_SECONDS}, so the next lookup misses
 * and Postgres re-decides. No scan, no delete needed.
 */
function fastPathKey(
  subject: ThrottleSubject & { windowSeconds: number },
): string {
  return `throttle:${subject.throttleType}:${subject.subjectId}:${subject.workspaceId}:${subject.contactInboxId}:w${subject.windowSeconds}`
}

function assertValidWindowSeconds(windowSeconds: number): void {
  // 0 = unbounded ("always allow, but still record the trigger"); negatives and
  // non-integers are caller bugs.
  if (!Number.isInteger(windowSeconds) || windowSeconds < 0) {
    throw new TypeError(
      `automationThrottleService: windowSeconds must be a non-negative integer, got ${windowSeconds}`,
    )
  }
}

/**
 * `clamp(remainingSeconds, 1, FASTPATH_TTL)`, or `null` when there is nothing
 * worth caching (the window has already elapsed by the time the DB replied).
 */
function fastPathTtl(remainingSeconds: number): number | null {
  if (remainingSeconds <= 0) {
    return null
  }
  return Math.min(
    Math.max(remainingSeconds, 1),
    AUTOMATION_THROTTLE_FASTPATH_TTL_SECONDS,
  )
}

/**
 * Rate-limit the fail-open error log. There is no metrics backend in this repo,
 * so a throttled structured error log is the observability surface for a
 * Postgres claim outage: the stable message is alertable, and this cap stops a
 * sustained outage from flooding logs under high traffic. Per worker process,
 * best-effort — diagnostics, not correctness. `failOpenCount` reports how many
 * fail-opens occurred since the previous log line.
 */
const FAIL_OPEN_LOG_INTERVAL_MS = 60_000
let lastFailOpenLoggedAtMs = 0
let suppressedFailOpenCount = 0

function logFailOpen(context: Record<string, unknown>, err: unknown): void {
  suppressedFailOpenCount += 1
  const now = Date.now()
  if (now - lastFailOpenLoggedAtMs < FAIL_OPEN_LOG_INTERVAL_MS) {
    return
  }
  logger.error(
    { ...context, err, failOpenCount: suppressedFailOpenCount },
    "automation-throttle: Postgres claim failed, failing open",
  )
  lastFailOpenLoggedAtMs = now
  suppressedFailOpenCount = 0
}

class AutomationThrottleService extends BaseService {
  /**
   * Atomically claims a throttle slot for `(workspaceId, contactInboxId,
   * throttleType, subjectId)` under `windowSeconds`. Redis is consulted
   * first as a fast-path cache of "recently decided"; a miss (or a Redis
   * error, which is treated as a miss) falls through to the Postgres
   * source-of-truth claim, which is race-safe (single atomic
   * `onConflictDoUpdate`) and idempotent on retry.
   *
   * Redis errors fall through to Postgres (Postgres remains authoritative).
   * Postgres errors **fail open** (`bypassed`) — a missed throttle window is
   * preferable to a bot that stops replying because of an infra hiccup.
   */
  async tryAcquire(
    params: ThrottleSubject & { windowSeconds: number },
  ): Promise<AutomationThrottleClaim> {
    assertValidWindowSeconds(params.windowSeconds)

    const key = fastPathKey(params)
    // Unbounded (`windowSeconds` 0) always allows and never has a marker, so
    // skip the Redis read and go straight to the record-and-allow claim.
    if (
      params.windowSeconds > 0 &&
      (await this.readCachedDenial(key, params))
    ) {
      return { result: "denied" }
    }

    const claimId = crypto.randomUUID()
    let outcome: Awaited<ReturnType<typeof claimAutomationThrottle>>
    try {
      outcome = await claimAutomationThrottle({ ...params, claimId })
    } catch (err) {
      logFailOpen(params, err)
      return { result: "bypassed" }
    }

    await this.cacheDecision(key, outcome.remainingSeconds, params)

    return outcome.won
      ? {
          result: "acquired",
          claimId: outcome.claimId,
          remainingSeconds: outcome.remainingSeconds,
        }
      : { result: "denied" }
  }

  /**
   * Best-effort rollback of a claim made by {@link tryAcquire}, used when the
   * caller `acquired` the slot but then failed to actually act on it (e.g. a
   * queue add threw). Only call this for an `acquired` result — `denied`/
   * `bypassed` callers own no claim.
   *
   * Never throws: a stuck claim just means the contact waits out the window,
   * which is the fail-open default anyway.
   */
  async release(
    params: ThrottleSubject & { windowSeconds: number; claimId: string },
  ): Promise<void> {
    let removedOwnedRow = false
    try {
      removedOwnedRow = await releaseAutomationThrottle(params)
    } catch (err) {
      logger.warn(
        { err, ...params },
        "automation-throttle: Postgres release failed",
      )
    }

    // Only evict the Redis marker when the CAS deleted our own row. If it
    // matched nothing, a newer claim already owns the row (and its marker), so
    // evicting here would needlessly reopen the DB fast-path for that claim.
    if (removedOwnedRow && params.windowSeconds > 0) {
      await this.evictMarker(fastPathKey(params), params)
    }
  }

  /** Redis fast-path read; a Redis error is treated as a cache miss. */
  private async readCachedDenial(
    key: string,
    subject: ThrottleSubject,
  ): Promise<boolean> {
    try {
      return await distributedStore.exists(key)
    } catch (err) {
      logger.warn(
        { err, ...subject },
        "automation-throttle: redis fast-path check failed, falling through to Postgres",
      )
      return false
    }
  }

  /** Caches the decision as a fast-path marker, skipping when nothing is worth caching. */
  private async cacheDecision(
    key: string,
    remainingSeconds: number,
    subject: ThrottleSubject,
  ): Promise<void> {
    const ttl = fastPathTtl(remainingSeconds)
    if (ttl === null) {
      return
    }
    try {
      await distributedStore.setNumber(key, 1, ttl)
    } catch (err) {
      logger.warn(
        { err, ...subject },
        "automation-throttle: failed to write redis fast-path marker",
      )
    }
  }

  /** Best-effort eviction of the fast-path marker. */
  private async evictMarker(
    key: string,
    subject: ThrottleSubject,
  ): Promise<void> {
    try {
      await distributedStore.delete(key)
    } catch (err) {
      logger.warn(
        { err, ...subject },
        "automation-throttle: redis release failed",
      )
    }
  }
}

export const automationThrottleService = new AutomationThrottleService()
