import {
  type ExpiredSocialTarget,
  type SocialTargetForPublish,
  type SocialTargetOutcome,
  socialPostPublishRepository,
} from "@chatbotx.io/database/repositories"
import { normalisePublishTarget } from "@chatbotx.io/utils/post-publishing"
import {
  FINAL_CALL_KEY,
  type SocialPublisherMap,
  type SocialPublishResult,
} from "@chatbotx.io/utils/social-publisher"
import { logger } from "../logger"
import {
  continuationViaMismatch,
  loadPublishCredentials,
  type PublishCredentials,
} from "../publish-destination/credentials"
import {
  asStringMap,
  logSafe,
  SOCIAL_POST_LEASE_MS,
  SOCIAL_POST_PROCESSING_TIMEOUT_MS,
  SOCIAL_POST_RECOVER_BATCH,
} from "./publish-common"
import {
  hasNoIdentity,
  SOCIAL_POST_MAX_ATTEMPTS,
  SOCIAL_POST_RETRY_BACKOFF_MS,
} from "./publish-outcome"

/**
 * The caption a staged publish carries, the one the first request carried:
 * a link the person supplied separately is appended the same way
 * (`normalisePublishTarget`), so a container created while checking the status
 * does not lose it. The media only affects issues, never the text.
 */
const recoveryText = (target: SocialTargetForPublish): string | null =>
  normalisePublishTarget({
    contentType: target.contentType,
    linkUrl: target.linkUrl,
    media: [],
    options: target.options,
    provider: target.provider,
    text: target.textOverride ?? target.postText,
  }).text

/** What recovery needs from the publish service: it stores results the same way a live attempt does. */
export type TargetRecoveryHooks = {
  applyResult: (
    target: SocialTargetForPublish,
    fence: Date,
    result: SocialPublishResult,
    credentials: PublishCredentials,
  ) => Promise<boolean>
  settle: (
    target: ExpiredSocialTarget,
    fence: Date,
    outcome: SocialTargetOutcome,
  ) => Promise<boolean>
}

const failedOutcome = (
  category: "authFailed" | "unknown",
  code: string,
  message: string,
): SocialTargetOutcome => ({
  error: { category, code, message },
  kind: "failed",
})

/**
 * A provider-side identity that publishes on its own once the network has
 * finished: a TikTok `publish_id` (Direct Post posts after the upload), a
 * Facebook feed video, a reel after `finish`, and any continuation that holds
 * the final-call marker (the post-creating call, such as an Instagram or
 * Threads publish or a Facebook finish, was possibly sent). A failed target
 * with one of these can be retried by a person, which would start a second
 * upload and post twice, so these wait for review instead. Instagram and
 * Threads containers publish only through the final publish call, so a
 * stalled one is safe to fail.
 */
const publishesOnItsOwn = (
  continuation: Record<string, unknown> | null,
): boolean =>
  continuation !== null &&
  (typeof continuation.publishId === "string" ||
    typeof continuation[FINAL_CALL_KEY] === "string" ||
    continuation.flow === "video" ||
    continuation.phase === "finishing")

const REVIEW_HINT =
  " The post may already be published; check the page, then mark it published or retry."

/** `failed` for a stalled container; `needsReview` when the network may still publish it. */
const stalledOutcome = (
  continuation: Record<string, unknown> | null,
  category: "authFailed" | "unknown",
  code: string,
  message: string,
): SocialTargetOutcome =>
  publishesOnItsOwn(continuation)
    ? {
        error: { category, code, message: `${message}${REVIEW_HINT}` },
        kind: "needsReview",
      }
    : failedOutcome(category, code, message)

/** The error a retried unknown-outcome publish records, and the code of its give-up. */
const OUTCOME_UNKNOWN_RETRIED_CODE = "outcomeUnknownRetried"

/**
 * The outcome of a lease that ran out before any network-side identity was
 * stored. With the marker written the request may have reached the network and
 * there is nothing to read back (a direct publish leaves no provider-side
 * identity), so it is retried like a provably uncreated failure: the attempt is
 * spent, the retry ladder waits, and after the last attempt the target fails.
 * The destination may get the post twice.
 */
const outcomeWithoutContinuation = (
  expired: ExpiredSocialTarget,
  now: Date,
): SocialTargetOutcome => {
  const sent = Boolean(expired.publishStartedAt)
  if (expired.attemptCount >= SOCIAL_POST_MAX_ATTEMPTS) {
    return failedOutcome(
      "unknown",
      "attemptsExhausted",
      sent
        ? "The attempt stopped after the request was sent, five times; the post may exist on the network."
        : "The attempt stopped before reaching the network.",
    )
  }
  if (!sent) {
    return { error: null, kind: "retry", nextAttemptAt: now }
  }
  const wait = SOCIAL_POST_RETRY_BACKOFF_MS[expired.attemptCount - 1] ?? 0
  return {
    error: {
      category: "unknown",
      code: OUTCOME_UNKNOWN_RETRIED_CODE,
      message:
        "The attempt stopped after the request was sent and its result is unknown; it is retried and the post may appear twice.",
    },
    kind: "retry",
    nextAttemptAt: new Date(now.getTime() + wait),
  }
}

const recoverOne = async (
  hooks: TargetRecoveryHooks,
  expired: ExpiredSocialTarget,
  publishers: SocialPublisherMap,
): Promise<void> => {
  const settleExpired = (outcome: SocialTargetOutcome) =>
    hooks.settle(expired, expired.leaseUntil, outcome)
  const now = new Date()
  const identity = hasNoIdentity(expired.continuation)
    ? null
    : expired.continuation
  if (!identity) {
    await settleExpired(outcomeWithoutContinuation(expired, now))
    return
  }
  const timedOut =
    expired.publishStartedAt &&
    now.getTime() - expired.publishStartedAt.getTime() >
      SOCIAL_POST_PROCESSING_TIMEOUT_MS
  if (timedOut) {
    await settleExpired(
      stalledOutcome(
        identity,
        "unknown",
        "processingTimeout",
        "The network did not finish processing the files in time.",
      ),
    )
    return
  }
  const target = await socialPostPublishRepository.findForPublish({
    id: expired.id,
    workspaceId: expired.workspaceId,
  })
  if (!target) {
    await settleExpired(
      stalledOutcome(
        identity,
        "unknown",
        "publisherUnavailable",
        "The destination of this target is gone.",
      ),
    )
    return
  }
  const loaded = await loadPublishCredentials({
    publishDestinationId: target.destinationId,
    workspaceId: target.workspaceId,
  })
  if (!loaded.ok) {
    await settleExpired(
      stalledOutcome(
        identity,
        "authFailed",
        loaded.blocker.code,
        loaded.blocker.message,
      ),
    )
    return
  }
  const { credentials } = loaded
  if (continuationViaMismatch(identity, credentials.publisherKey)) {
    // The container belongs to the other Instagram flavour: reading it here
    // would not find it, and the post may still publish through the old one.
    await settleExpired({
      error: {
        category: "unknown",
        code: "publisherChanged",
        message:
          "The channel connection type changed while the post was processing. Check the post on the network, then mark it published or retry.",
      },
      kind: "needsReview",
    })
    return
  }
  const publisher = publishers[credentials.publisherKey]
  if (!publisher) {
    await settleExpired(
      stalledOutcome(
        identity,
        "unknown",
        "publisherUnavailable",
        "No publisher is registered for this network.",
      ),
    )
    return
  }
  // The lease fence moves when the publisher stores its final-call marker.
  let fence = expired.leaseUntil
  const checkpoint = async (
    continuation: Record<string, string>,
  ): Promise<boolean> => {
    const nextCheckAt = new Date(Date.now() + SOCIAL_POST_LEASE_MS)
    const stored = await hooks.settle(expired, fence, {
      continuation,
      kind: "processing",
      nextCheckAt,
    })
    if (stored) {
      fence = nextCheckAt
    }
    return stored
  }
  // Reading a container never creates a second post: the container id is the
  // provider-side identity of this publish. The call that does create it is
  // checkpointed first and never repeated (see `FINAL_CALL_KEY`).
  const result = await publisher.checkStatus({
    accessToken: credentials.accessToken,
    checkpoint,
    contentType: target.contentType,
    continuation: asStringMap(identity),
    destinationExternalId: credentials.destinationExternalId,
    options: target.options,
    text: recoveryText(target),
  })
  await hooks.applyResult(
    // The continuation read back is the provider-side identity of this publish.
    {
      ...target,
      attemptCount: expired.attemptCount,
      continuation: identity,
    },
    fence,
    result,
    credentials,
  )
}

/**
 * Takes over targets whose lease ran out and returns them, each with its new
 * lease. Nothing is read from the network here: the caller hands every claim to
 * its own job (`recoverClaimedTarget`), so a slow network cannot stall the scan
 * or the other networks. A claim whose job is lost simply expires again.
 */
export const claimExpiredTargets = async (
  now: Date,
): Promise<ExpiredSocialTarget[]> =>
  await socialPostPublishRepository.claimExpired({
    leaseUntil: new Date(now.getTime() + SOCIAL_POST_LEASE_MS),
    limit: SOCIAL_POST_RECOVER_BATCH,
    now,
  })

/**
 * The delayed check job's claim: swaps the check time stored as the lease
 * (`expectedDueAt`) for a recovery lease, atomically with the minute scan's
 * claim. `null` when another claimer or a settlement got there first: the
 * caller then makes no network call.
 */
export const claimDueTarget = async (input: {
  expectedDueAt: Date
  id: string
  now: Date
  workspaceId: string
}): Promise<ExpiredSocialTarget | null> => {
  const [claimed] = await socialPostPublishRepository.claimExpired({
    leaseUntil: new Date(input.now.getTime() + SOCIAL_POST_LEASE_MS),
    limit: 1,
    now: input.now,
    only: {
      expectedDueAt: input.expectedDueAt,
      id: input.id,
      workspaceId: input.workspaceId,
    },
  })
  return claimed ?? null
}

/**
 * One recovery job: a container is read again; an attempt that never reached the
 * network goes back to the queue; one that did and left no provider-side
 * identity is retried too (it may post twice). Acts only while `leaseUntil` is still the stored
 * lease; otherwise another worker owns the target and nothing changes. Returns
 * whether the claim was still held.
 */
export const recoverClaimedTarget = async (
  hooks: TargetRecoveryHooks,
  claim: { id: string; leaseUntil: Date; workspaceId: string },
  publishers: SocialPublisherMap,
): Promise<boolean> => {
  const expired = await socialPostPublishRepository.findExpiredClaim(claim)
  if (!expired) {
    return false
  }
  try {
    await recoverOne(hooks, expired, publishers)
  } catch (err) {
    logger.error(
      { err: logSafe(err), targetId: expired.id },
      "social-post publish: recovery of a target failed",
    )
  }
  return true
}
