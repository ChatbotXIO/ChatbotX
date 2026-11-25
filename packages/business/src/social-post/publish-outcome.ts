import type {
  SocialTargetError,
  SocialTargetOutcome,
} from "@chatbotx.io/database/repositories"
import {
  MAX_PUBLISH_WAIT_MS,
  type PublishPauseReason,
  RATE_LIMIT_BACKOFF_MS,
  RATE_LIMIT_EXHAUSTED_CODE,
  RATE_LIMIT_JITTER_MAX_MS,
  TOKEN_THROTTLE_WAIT_MS,
  withJitter,
} from "@chatbotx.io/utils/publish-limits"
import type {
  SocialPublishErrorCategory,
  SocialPublishFailed,
} from "@chatbotx.io/utils/social-publisher"
import type { PublishAuthFailureCategory } from "../publish-destination/credentials"

const MINUTE_MS = 60 * 1000
/** Wait before attempt 2, 3, 4 and 5. */
export const SOCIAL_POST_RETRY_BACKOFF_MS: readonly number[] = [
  1 * MINUTE_MS,
  5 * MINUTE_MS,
  15 * MINUTE_MS,
  60 * MINUTE_MS,
]
export const SOCIAL_POST_MAX_ATTEMPTS = SOCIAL_POST_RETRY_BACKOFF_MS.length + 1
const MAX_ERROR_MESSAGE_LENGTH = 500
const TOKEN_THROTTLE_JITTER_MAX_MS = 5 * 1000

/**
 * Categories worth another try later: the network refused for a reason that
 * passes. Auth, permission and content errors would fail again the same way.
 */
const RETRYABLE_CATEGORIES: readonly SocialPublishErrorCategory[] = [
  "networkError",
  "quotaExceeded",
  "unknown",
]

/** The answers whose outcome is unknown: what a lost response or a timeout reports. */
const UNKNOWN_OUTCOME_CATEGORIES: readonly SocialPublishErrorCategory[] = [
  "networkError",
  "unknown",
]

/**
 * Limit answers: a budget of their own (1 h, 2 h, 4 h), apart from the
 * network-error attempts, and the only ones that can pause a destination.
 */
const LIMIT_CATEGORIES: readonly SocialPublishErrorCategory[] = [
  "rateLimited",
  "accountRestricted",
]

/** The categories that mean the credential itself is no good. */
const AUTH_FAILURE_CATEGORIES: readonly PublishAuthFailureCategory[] = [
  "authFailed",
  "permissionDenied",
]

const authFailureOf = (
  category: SocialPublishErrorCategory,
): PublishAuthFailureCategory | null =>
  AUTH_FAILURE_CATEGORIES.find((candidate) => candidate === category) ?? null

/**
 * True when the target holds no provider-side identity (a container id, an
 * upload id, a publish id): a direct publish leaves none, so an unknown
 * outcome cannot be read back later.
 */
export const hasNoIdentity = (
  continuation: Record<string, unknown> | null,
): boolean => continuation === null || Object.keys(continuation).length === 0

export type ClassifiedFailure = {
  /** A failed call never publishes: its outcome fits a target and a part alike. */
  outcome: Extract<
    SocialTargetOutcome,
    { kind: "failed" | "needsReview" | "retry" }
  >
  /** Set when the credential was rejected or lacks a permission: the connection must be redone. */
  authFailure: PublishAuthFailureCategory | null
  /**
   * Set when the answer is the account's own limit, restriction or spam
   * answer: it counts toward the destination's circuit breaker. `null` for an
   * app-level limit (the target backs off, no destination is paused).
   */
  pauseReason: PublishPauseReason | null
}

/** Which pause an account-level limit answer counts toward; `null` when it is not one. */
export const pauseReasonOf = (
  failure: Pick<SocialPublishFailed, "category" | "code" | "scope">,
): PublishPauseReason | null => {
  if (failure.category === "accountRestricted") {
    return "accountRestricted"
  }
  if (failure.category === "rateLimited" && failure.scope === "account") {
    return failure.code.startsWith("spam_risk") ? "spamRisk" : "limitReached"
  }
  return null
}

export const toTargetError = (
  failure: Pick<SocialPublishFailed, "category" | "code" | "message">,
): SocialTargetError => ({
  category: failure.category,
  code: failure.code,
  message: failure.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
})

/**
 * What a failed call means for the target:
 * - retry later: only when the error proves nothing was created (or the network
 *   rate-limited the call), up to five attempts with growing waits;
 * - needs a person: the call may have created the post and nothing proves it
 *   did not, so it is never retried automatically, except when the publish has
 *   no provider-side identity at all (`retryUnknownOutcome`, a direct publish
 *   such as a Facebook text, link or photo post): nothing could be read or
 *   adopted later, so an unknown outcome is retried like a provably uncreated
 *   one and the destination may get a duplicate post;
 * - failed: nothing was created and trying again would not help.
 */
export const classifyFailure = (
  failure: SocialPublishFailed,
  input: {
    attemptCount: number
    now: Date
    /** Limit-answer retries already used (their own budget). */
    rateLimitAttempts?: number
    /**
     * The publish left no provider-side identity (no continuation): a
     * network error or unknown answer is retried, never sent to review.
     */
    retryUnknownOutcome?: boolean
    /** Injectable for tests. */
    random?: () => number
  },
): ClassifiedFailure => {
  const error = toTargetError(failure)
  const authFailure = authFailureOf(failure.category)
  const pauseReason = pauseReasonOf(failure)
  const retryableUnknown =
    input.retryUnknownOutcome === true &&
    UNKNOWN_OUTCOME_CATEGORIES.includes(failure.category)
  if (!(failure.provablyNotCreated || retryableUnknown)) {
    // The call may have created the post: a person decides, never a retry,
    // whatever the category (a limit answer on a status read proves nothing).
    return { outcome: { error, kind: "needsReview" }, authFailure, pauseReason }
  }
  if (failure.category === "rateLimited" && failure.scope === "token") {
    // A per-minute throttle on the token: retry soon, outside the 1/2/4 h
    // ladder, never toward pausing the destination; bounded by the attempts.
    if (input.attemptCount >= SOCIAL_POST_MAX_ATTEMPTS) {
      return { outcome: { error, kind: "failed" }, authFailure, pauseReason }
    }
    const wait = Math.min(
      Math.max(
        withJitter(
          TOKEN_THROTTLE_WAIT_MS,
          TOKEN_THROTTLE_JITTER_MAX_MS,
          input.random,
        ),
        failure.retryAfterMs ?? 0,
      ),
      MAX_PUBLISH_WAIT_MS,
    )
    return {
      outcome: {
        error,
        kind: "retry",
        nextAttemptAt: new Date(input.now.getTime() + wait),
      },
      authFailure,
      pauseReason,
    }
  }
  if (LIMIT_CATEGORIES.includes(failure.category)) {
    const used = input.rateLimitAttempts ?? 0
    const ladder = RATE_LIMIT_BACKOFF_MS[used]
    if (ladder === undefined) {
      return {
        outcome: {
          error: {
            ...error,
            code: RATE_LIMIT_EXHAUSTED_CODE,
            message:
              `The network kept limiting publishing (${failure.code}); gave up after ${used} waits. ${error.message}`.slice(
                0,
                MAX_ERROR_MESSAGE_LENGTH,
              ),
          },
          kind: "failed",
        },
        authFailure,
        pauseReason,
      }
    }
    const wait = Math.min(
      Math.max(
        withJitter(ladder, RATE_LIMIT_JITTER_MAX_MS, input.random),
        failure.retryAfterMs ?? 0,
      ),
      MAX_PUBLISH_WAIT_MS,
    )
    return {
      outcome: {
        budget: "rateLimit",
        error,
        kind: "retry",
        nextAttemptAt: new Date(input.now.getTime() + wait),
      },
      authFailure,
      pauseReason,
    }
  }
  if (RETRYABLE_CATEGORIES.includes(failure.category)) {
    const wait = SOCIAL_POST_RETRY_BACKOFF_MS[input.attemptCount - 1]
    if (wait === undefined) {
      return { outcome: { error, kind: "failed" }, authFailure, pauseReason }
    }
    return {
      outcome: {
        error,
        kind: "retry",
        nextAttemptAt: new Date(input.now.getTime() + wait),
      },
      authFailure,
      pauseReason,
    }
  }
  return { outcome: { error, kind: "failed" }, authFailure, pauseReason }
}
