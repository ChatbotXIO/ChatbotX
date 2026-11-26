import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type SocialTargetForPublish,
  type SocialTargetOutcome,
  socialPostPartRepository,
  socialPostPublishRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import {
  normalisePublishTarget,
  validateParts,
} from "@chatbotx.io/utils/post-publishing"
import type {
  SocialPublisherMap,
  SocialPublishMedia,
  SocialPublishRequest,
  SocialPublishResult,
} from "@chatbotx.io/utils/social-publisher"
import {
  PostPublishJobAction,
  postCheckTargetJobId,
  postPublishJobId,
  postPublishQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { logger } from "../logger"
import { messageUsageService } from "../message-usage/service"
import { resolveTenantSettings } from "../platform/settings"
import {
  loadPublishCredentials,
  type PublishCredentials,
} from "../publish-destination/credentials"
import { getPublicFileUrl } from "../utils"
import { SOCIAL_POST_CONTENT_INVALID_CODE } from "./error-codes"
import { destinationIssue } from "./evaluate"
import { linkPublishedChannelPost } from "./link-channel-post"
import { specsOfRows } from "./media"
import { announceSettledTarget, emitSocialPostChanged } from "./notify"
import { loadPostGraph } from "./post-graph"
import { recomputePostInTx } from "./post-state"
import {
  failure,
  logSafe,
  MIN_POLL_MS,
  recordPublishAuthFailureSafely,
  SOCIAL_POST_LEASE_MS,
} from "./publish-common"
import {
  recordLimitErrorSafely,
  resetLimitErrorsSafely,
  resetLimitStreakSafely,
} from "./publish-limit-errors"
import {
  classifyFailure,
  hasNoIdentity,
  toTargetError,
} from "./publish-outcome"
import {
  checkPace,
  type PaceDeferReason,
  spacingDeferral,
} from "./publish-pace"
import {
  SOCIAL_POST_HEAD_UNCONFIRMED_CODE,
  socialPostPartPublishService,
} from "./publish-parts.service"
import {
  chargePublishedTarget,
  SOCIAL_POST_QUOTA_ERROR,
  sweepPendingQuotaCharges,
} from "./publish-quota"
import { claimExpiredTargets, recoverClaimedTarget } from "./publish-recovery"
import { lateCutoffAt } from "./schedule-policy"
import { socialPostService } from "./service"
import type { SocialPostDto, SocialPostIssue } from "./types"

/** A due target is pushed this far ahead when the scan hands it to the queue. */
export const SOCIAL_POST_DUE_PUSH_BACK_MS = 5 * 60 * 1000
export const SOCIAL_POST_DUE_BATCH = 100

export const SOCIAL_POST_NOT_PUBLISHABLE_CODE = "socialPostNotPublishable"
export const SOCIAL_POST_TARGET_NOT_RETRYABLE_CODE =
  "socialPostTargetNotRetryable"
export const SOCIAL_POST_TARGET_NOT_REVIEWABLE_CODE =
  "socialPostTargetNotReviewable"

export { SOCIAL_POST_CONTENT_INVALID_CODE } from "./error-codes"

import { claimInBatches, SOCIAL_POST_RECOVER_BATCH } from "./publish-common"

export {
  SOCIAL_POST_LEASE_MS,
  SOCIAL_POST_PROCESSING_TIMEOUT_MS,
  SOCIAL_POST_RECOVER_BATCH,
} from "./publish-common"

export type SocialTargetResolution = "published" | "retry"

/** What one job run did with its target. */
export type RunTargetResult =
  | "claimLost"
  /** The pace gate pushed the attempt back (spacing, cap, pause, provider slots): no attempt was spent. */
  | "deferred"
  | "settled"
  | "skipped"

export const socialPostIssuesException = (
  issues: readonly SocialPostIssue[],
) => {
  const error = validationException(
    "targets",
    issues
      .map(
        (issue) =>
          `Destination ${issue.targetIndex + 1} (${issue.field}): ${issue.message}`,
      )
      .join(" "),
    { issues: JSON.stringify(issues) },
  )
  error.code = SOCIAL_POST_CONTENT_INVALID_CODE
  return error
}

type AttemptState = {
  markerWritten: boolean
  /** Set once the pace gate let the attempt through; the job gives the provider slot back at its end. */
  releaseSlot: (() => Promise<void>) | null
}

class SocialPostPublishService extends BaseService {
  /**
   * Every issue of every target of a stored post, as `validate` would report
   * them. Publishing refuses a post with any.
   */
  async storedIssues(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialPostIssue[]> {
    const { id, workspaceId } = input
    const post = await socialPostRepository.findForWorkspace(
      {
        id,
        workspaceId,
      },
      tx,
    )
    if (!post) {
      throw notFoundException("Post not found")
    }
    const { parts, postMedia, targetMedia, targets } = await loadPostGraph(tx, {
      postIds: [id],
      workspaceId,
    })
    const destinations = await socialPostRepository.findDestinations(
      {
        ids: targets.map((target) => target.destinationId),
        workspaceId,
      },
      tx,
    )
    const byDestination = new Map(destinations.map((row) => [row.id, row]))
    const issues: SocialPostIssue[] = []
    for (const [targetIndex, target] of targets.entries()) {
      const media = target.overridesMedia
        ? targetMedia.filter((row) => row.socialPostTargetId === target.id)
        : postMedia
      const normalised = normalisePublishTarget({
        contentType: target.contentType,
        linkUrl: post.linkUrl,
        media: specsOfRows(media),
        options: target.options,
        provider: target.provider,
        text: target.textOverride ?? post.text,
      })
      const blocker = destinationIssue(byDestination.get(target.destinationId))
      const partIssues = validateParts(
        target.provider,
        parts
          .filter((part) => part.socialPostTargetId === target.id)
          .map((part) => ({ kind: part.kind, text: part.text })),
      )
      for (const issue of [
        ...(blocker ? [blocker] : []),
        ...normalised.issues,
        ...partIssues,
      ]) {
        issues.push({
          ...issue,
          destinationId: target.destinationId,
          targetIndex,
        })
      }
    }
    return issues
  }

  /**
   * Publishes a draft or scheduled post now: its pending targets become due and
   * one job per target is enqueued after the commit. A post with any content
   * issue is refused whole, with every issue in one response.
   */
  async publishNow(input: {
    id: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { id, workspaceId } = input
    const now = new Date()
    const targetIds = await db.transaction(async (tx) => {
      const post = await socialPostPublishRepository.lockPost(
        { id, workspaceId },
        tx,
      )
      if (!post) {
        throw notFoundException("Post not found")
      }
      if (post.status !== "draft" && post.status !== "scheduled") {
        throw conflictException(
          "Only a draft or scheduled post can be published",
          SOCIAL_POST_NOT_PUBLISHABLE_CODE,
        )
      }
      // Validated under the post lock: an edit that commits before the lock is
      // seen here, and none can commit between this check and the due-marking.
      const issues = await this.storedIssues(input, tx)
      if (issues.length > 0) {
        throw socialPostIssuesException(issues)
      }
      const ids = await socialPostPublishRepository.requestPublishNow(
        { now, socialPostId: id, workspaceId },
        tx,
      )
      if (ids.length === 0) {
        throw conflictException(
          "The post has nothing left to publish",
          SOCIAL_POST_NOT_PUBLISHABLE_CODE,
        )
      }
      // Not recomputed: every target is still pending, which keeps a draft or
      // scheduled post as it was and leaves it publishable a second time.
      await socialPostPublishRepository.setPostStatus(
        { completedAt: null, id, status: "publishing", workspaceId },
        tx,
      )
      return ids
    })
    await this.enqueue(targetIds, workspaceId)
    const post = await socialPostService.get({ id, workspaceId })
    await emitSocialPostChanged({
      socialPostId: id,
      status: post.status,
      workspaceId,
    })
    return post
  }

  /** A failed or unconfirmed target tries again from the start, with a fresh attempt count. */
  async retryTarget(input: {
    id: string
    /** Names the part to resume; it must be the first one not published. */
    partId?: string
    targetId: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { id, targetId, workspaceId } = input
    const current = await this.assertTargetOfPost(input)
    // A target whose head is out resumes at its first unsettled part: the head
    // is never published again.
    if (current.externalPostId && current.status !== "published") {
      return await socialPostPartPublishService.retryPart(input)
    }
    const done = await db.transaction(async (tx) => {
      await socialPostPublishRepository.lockPost({ id, workspaceId }, tx)
      const postId = await socialPostPublishRepository.resetForRetry(
        { id: targetId, now: new Date(), workspaceId },
        tx,
      )
      if (!postId) {
        return false
      }
      await this.recomputePost(tx, id, workspaceId)
      return true
    })
    if (!done) {
      throw conflictException(
        "Only a failed target, or one waiting for review, can be retried",
        SOCIAL_POST_TARGET_NOT_RETRYABLE_CODE,
      )
    }
    await this.enqueue([targetId], workspaceId)
    return await this.getAndAnnounce({ id, targetId, workspaceId })
  }

  /**
   * Settles a target waiting for review. `published`: a person saw the post on
   * the network. `retry`: they accept the risk of a second post and publish again.
   */
  async resolveTarget(input: {
    id: string
    outcome: SocialTargetResolution
    partId?: string
    targetId: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { id, targetId, workspaceId } = input
    if (input.outcome === "retry") {
      const target = await this.assertTargetOfPost(input)
      if (target.status !== "needsReview") {
        throw conflictException(
          "Only a target waiting for review can be resolved",
          SOCIAL_POST_TARGET_NOT_REVIEWABLE_CODE,
        )
      }
      return await this.retryTarget(input)
    }
    const current = await this.assertTargetOfPost(input)
    if (current.externalPostId && current.status === "needsReview") {
      return await socialPostPartPublishService.resolvePartAsPublished(input)
    }
    if (
      current.status === "needsReview" &&
      (await this.hasParts(targetId, workspaceId))
    ) {
      throw conflictException(
        "The first post is not confirmed, so its follow-up parts cannot be published after it. Retry the destination instead.",
        SOCIAL_POST_HEAD_UNCONFIRMED_CODE,
      )
    }
    const done = await db.transaction(async (tx) => {
      await socialPostPublishRepository.lockPost({ id, workspaceId }, tx)
      const postId = await socialPostPublishRepository.resolveAsPublished(
        { id: targetId, now: new Date(), workspaceId },
        tx,
      )
      if (!postId) {
        return false
      }
      await this.recomputePost(tx, id, workspaceId)
      return true
    })
    if (!done) {
      throw conflictException(
        "Only a target waiting for review can be resolved",
        SOCIAL_POST_TARGET_NOT_REVIEWABLE_CODE,
      )
    }
    await chargePublishedTarget({ id: targetId, workspaceId })
    return await this.getAndAnnounce({ id, targetId, workspaceId })
  }

  private async hasParts(
    targetId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const parts = await socialPostPartRepository.listForTargets({
      targetIds: [targetId],
      workspaceId,
    })
    return parts.length > 0
  }

  /** The post as stored after a change to one of its targets, announced to the Posts pages. */
  private async getAndAnnounce(input: {
    id: string
    targetId: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { id, targetId, workspaceId } = input
    const post = await socialPostService.get({ id, workspaceId })
    await emitSocialPostChanged({
      socialPostId: id,
      status:
        post.targets.find((target) => target.id === targetId)?.status ??
        post.status,
      targetId,
      workspaceId,
    })
    return post
  }

  /** One scan tick: hands the due targets to the queue. Returns how many. */
  async scanDue(now: Date = new Date()): Promise<number> {
    const queued = await claimInBatches({
      batchSize: SOCIAL_POST_DUE_BATCH,
      claim: () =>
        socialPostPublishRepository.claimDue({
          lateCutoff: lateCutoffAt(now),
          limit: SOCIAL_POST_DUE_BATCH,
          now,
          pushBackUntil: new Date(now.getTime() + SOCIAL_POST_DUE_PUSH_BACK_MS),
        }),
      handle: async (due) => {
        for (const target of due) {
          await this.enqueue([target.id], target.workspaceId)
        }
      },
    })
    return queued + (await socialPostPartPublishService.scanDue(now))
  }

  /**
   * One attempt for one target: claim it, check it, write the attempt marker,
   * call the network, store the result. No network call runs inside a
   * transaction, and every write presents the claim's lease.
   */
  async runTarget(
    input: { id: string; workspaceId: string },
    publishers: SocialPublisherMap,
  ): Promise<RunTargetResult> {
    const now = new Date()
    const claim = await socialPostPublishRepository.claim({
      id: input.id,
      lateCutoff: lateCutoffAt(now),
      leaseUntil: new Date(now.getTime() + SOCIAL_POST_LEASE_MS),
      now,
      workspaceId: input.workspaceId,
    })
    if (!claim) {
      return "skipped"
    }
    const target = await socialPostPublishRepository.findForPublish(input)
    if (!target) {
      return "skipped"
    }
    const state: AttemptState = { markerWritten: false, releaseSlot: null }
    try {
      return await this.attempt(target, claim.leaseUntil, publishers, state)
    } catch (err) {
      logger.error(
        { err: logSafe(err), targetId: target.id },
        "social-post publish: attempt crashed",
      )
      // Before the marker nothing could have been created: retry. After it,
      // classifyFailure retries only when no provider-side identity was stored
      // (a duplicate post is accepted); with one, a person decides.
      const classified = classifyFailure(
        failure(
          "unknown",
          "internalError",
          "The publish attempt stopped unexpectedly.",
          !state.markerWritten,
        ),
        {
          attemptCount: target.attemptCount,
          now: new Date(),
          rateLimitAttempts: target.rateLimitAttempts,
          retryUnknownOutcome: hasNoIdentity(target.continuation),
        },
      )
      await this.settle(target, claim.leaseUntil, classified.outcome)
      return "settled"
    } finally {
      await state.releaseSlot?.()
    }
  }

  /**
   * Takes over targets whose lease ran out, then the parts', and hands each
   * claim to its own job (`runTargetCheck` / `runPartCheck`): the network reads
   * run with the worker's concurrency instead of one after the other here. A
   * job that cannot be queued is not lost: its lease expires and the next tick
   * claims it again.
   */
  async recoverExpired(now: Date = new Date()): Promise<number> {
    const recovered = await claimInBatches({
      batchSize: SOCIAL_POST_RECOVER_BATCH,
      claim: () => claimExpiredTargets(now),
      handle: async (expired) => {
        for (const target of expired) {
          await this.enqueueCheck(target)
        }
      },
    })
    const recoveredParts =
      await socialPostPartPublishService.recoverExpired(now)
    // Targets published whose charge crashed or failed: charged here, bounded.
    await sweepPendingQuotaCharges(SOCIAL_POST_RECOVER_BATCH)
    return recovered + recoveredParts
  }

  /** One recovery job: reads the network for one claimed target while its lease is held. */
  async runTargetCheck(
    input: { id: string; leaseUntil: Date; workspaceId: string },
    publishers: SocialPublisherMap,
  ): Promise<boolean> {
    return await recoverClaimedTarget(
      {
        applyResult: (target, fence, result, credentials) =>
          this.applyResult(target, fence, result, credentials),
        settle: (target, fence, outcome) => this.settle(target, fence, outcome),
      },
      input,
      publishers,
    )
  }

  private async enqueueCheck(target: {
    id: string
    leaseUntil: Date
    workspaceId: string
  }): Promise<void> {
    const leaseUntilMs = target.leaseUntil.getTime()
    try {
      await postPublishQueue.add(
        PostPublishJobAction.checkTarget,
        {
          data: {
            leaseUntilMs,
            socialPostTargetId: target.id,
            workspaceId: target.workspaceId,
          },
          type: PostPublishJobAction.checkTarget,
        },
        { jobId: postCheckTargetJobId(target.id, leaseUntilMs) },
      )
    } catch (err) {
      // The lease expires and the next tick claims the target again.
      logger.warn(
        { err: logSafe(err), targetId: target.id },
        "social-post publish: failed to enqueue the recovery job",
      )
    }
  }

  private async attempt(
    target: SocialTargetForPublish,
    fence: Date,
    publishers: SocialPublisherMap,
    state: AttemptState,
  ): Promise<RunTargetResult> {
    const loaded = await loadPublishCredentials({
      publishDestinationId: target.destinationId,
      workspaceId: target.workspaceId,
    })
    if (!loaded.ok) {
      await this.settle(target, fence, {
        error: toTargetError(loaded.blocker),
        kind: "failed",
      })
      return "settled"
    }
    const { credentials } = loaded
    const publisher = publishers[credentials.publisherKey]
    if (!publisher) {
      await this.settle(target, fence, {
        error: toTargetError(
          failure(
            "unknown",
            "publisherUnavailable",
            "No publisher is registered for this network.",
            true,
          ),
        ),
        kind: "failed",
      })
      return "settled"
    }
    const built = await this.buildRequest(target, credentials)
    if ("failed" in built) {
      await this.settle(target, fence, {
        error: built.failed,
        kind: "failed",
      })
      return "settled"
    }
    // The authoritative message-quota gate, after the claim and before the pace
    // gate (a refused target must not hold the destination's spacing slot) and
    // the marker: nothing was sent, so the attempt is not spent.
    if (!(await messageUsageService.hasRoom(target.workspaceId))) {
      return (await this.failForQuota(target, fence)) ? "settled" : "claimLost"
    }
    // The pace gate, before anything is sent and before the marker: a deferral
    // gives the claim back, so it spends no attempt.
    const now = new Date()
    const paceInput = {
      accessToken: credentials.accessToken,
      destinationExternalId: credentials.destinationExternalId,
      now,
      publisher,
      target,
    }
    const pace = await checkPace(paceInput)
    if (pace.kind === "defer") {
      await this.deferTarget(target, fence, pace.until, pace.reason)
      return "deferred"
    }
    state.releaseSlot = pace.releaseSlot
    // The marker first: from here on a crash is never a safe retry.
    const marked = await socialPostPublishRepository.markAttemptStarted({
      id: target.id,
      leaseUntil: fence,
      now: new Date(),
      // The pace gate reserved the destination at `now`.
      reservedAt: now,
      workspaceId: target.workspaceId,
    })
    if (marked === "leaseLost") {
      return "claimLost"
    }
    if (marked === "reservationTaken") {
      // A newer attempt reserved the destination: nothing was sent, so give
      // the claim back like a spacing deferral (no attempt spent; the
      // provider slot is released by the caller's `finally`).
      await this.deferTarget(
        target,
        fence,
        await spacingDeferral(paceInput),
        "spacing",
      )
      return "deferred"
    }
    state.markerWritten = true
    const result = await publisher.publish(built.request)
    return (await this.applyResult(target, fence, result, credentials))
      ? "settled"
      : "claimLost"
  }

  /**
   * Settles the target `failed` (`quotaExceeded`) without a provider call: not a
   * classified provider failure, no publish marker, the claim's attempt given
   * back. A person retries it after a top-up.
   */
  private async failForQuota(
    target: Pick<
      SocialTargetForPublish,
      "attemptCount" | "id" | "socialPostId" | "workspaceId"
    >,
    fence: Date,
  ): Promise<boolean> {
    return await this.settle(target, fence, {
      error: SOCIAL_POST_QUOTA_ERROR,
      giveAttemptBack: true,
      kind: "failed",
    })
  }

  /** Gives the claim back, due again at `until`; the attempt is not counted. */
  private async deferTarget(
    target: Pick<SocialTargetForPublish, "id" | "socialPostId" | "workspaceId">,
    fence: Date,
    until: Date,
    reason: PaceDeferReason,
  ): Promise<void> {
    const released = await socialPostPublishRepository.releaseClaim({
      fence,
      id: target.id,
      nextAttemptAt: until,
      workspaceId: target.workspaceId,
    })
    logger.info(
      { reason, released, targetId: target.id, until },
      "social-post publish: deferred by the pace gate",
    )
  }

  /** The request the publisher receives, re-validated against the registry at the moment of publishing. */
  private async buildRequest(
    target: SocialTargetForPublish,
    credentials: PublishCredentials,
  ): Promise<
    | { request: SocialPublishRequest }
    | { failed: ReturnType<typeof toTargetError> }
  > {
    const { workspaceId } = target
    const media = target.overridesMedia
      ? await socialPostRepository.listTargetMedia({
          targetIds: [target.id],
          workspaceId,
        })
      : await socialPostRepository.listPostMedia({
          postIds: [target.socialPostId],
          workspaceId,
        })
    const normalised = normalisePublishTarget({
      contentType: target.contentType,
      linkUrl: target.linkUrl,
      media: specsOfRows(media),
      options: target.options,
      provider: target.provider,
      text: target.textOverride ?? target.postText,
    })
    const [issue] = normalised.issues
    if (issue) {
      return {
        failed: toTargetError(
          failure("payloadInvalid", issue.code, issue.message, true),
        ),
      }
    }
    const { storageUrl } = await resolveTenantSettings({ workspaceId })
    const files: SocialPublishMedia[] = media.map((row) => ({
      altText: row.altText,
      durationMs: row.durationMs,
      mimeType: row.mimeType,
      url: getPublicFileUrl(row.path, storageUrl),
    }))
    return {
      request: {
        accessToken: credentials.accessToken,
        contentType: target.contentType,
        destinationExternalId: credentials.destinationExternalId,
        linkUrl: normalised.linkUrl,
        media: files,
        options: normalised.options,
        text: normalised.text,
      },
    }
  }

  /** Stores what a network call decided. `false` when the claim was lost. */
  private async applyResult(
    target: SocialTargetForPublish,
    fence: Date,
    result: SocialPublishResult,
    credentials: PublishCredentials,
  ): Promise<boolean> {
    const now = new Date()
    if (result.status === "published") {
      const hasParts = target.partCount > 0
      const stored = await this.settle(target, fence, {
        externalPostId: result.externalPostId,
        kind: hasParts ? "headPublished" : "published",
        permalink: result.permalink,
        publishedAt: now,
      })
      if (stored) {
        await resetLimitErrorsSafely(target)
      }
      // With parts the link is made when the last one is out.
      if (stored && !hasParts) {
        await this.linkChannelPost(
          target,
          result.externalPostId,
          credentials.destinationExternalId,
          result.permalink,
          now,
        )
      }
      return stored
    }
    if (result.status === "pending") {
      // Stored before the next call: the container id is the identity a
      // recovery reads.
      return await this.settle(target, fence, {
        continuation: result.continuation,
        kind: "processing",
        nextCheckAt: new Date(
          now.getTime() + Math.max(result.retryAfterMs, MIN_POLL_MS),
        ),
      })
    }
    const classified = classifyFailure(result, {
      attemptCount: target.attemptCount,
      now,
      rateLimitAttempts: target.rateLimitAttempts,
      retryUnknownOutcome: hasNoIdentity(target.continuation),
    })
    const stored = await this.settle(target, fence, classified.outcome)
    if (stored && classified.pauseReason) {
      await recordLimitErrorSafely(target, classified.pauseReason, now)
    } else if (
      stored &&
      result.category !== "networkError" &&
      result.scope !== "token" &&
      result.scope !== "app"
    ) {
      // The network answered with something that is not an account-level
      // limit: the streak of consecutive limit answers is over. A transport
      // error or a token / app throttle is not the network's decision about
      // the account, so it keeps the streak.
      await resetLimitStreakSafely(target)
    }
    if (stored && classified.authFailure) {
      await recordPublishAuthFailureSafely({
        category: classified.authFailure,
        credentials,
        workspaceId: target.workspaceId,
      })
    }
    return stored
  }

  private async settle(
    target: Pick<
      SocialTargetForPublish,
      "attemptCount" | "id" | "socialPostId" | "workspaceId"
    >,
    fence: Date,
    outcome: SocialTargetOutcome,
  ): Promise<boolean> {
    let startedPartId: string | null = null
    const settled = await db.transaction(async (tx) => {
      // Lock order everywhere: the post row first, then its targets. Taking the
      // target row first (the UPDATE below) would deadlock with cancel,
      // reschedule and the missed scan, which lock the post and then the targets.
      await socialPostPublishRepository.lockPost(
        { id: target.socialPostId, workspaceId: target.workspaceId },
        tx,
      )
      const postId = await socialPostPublishRepository.settle(
        { fence, id: target.id, outcome, workspaceId: target.workspaceId },
        tx,
      )
      if (!postId) {
        return null
      }
      if (outcome.kind === "headPublished") {
        // The head and the first part's turn are stored together: no moment
        // where the head is out and nothing says a part is next.
        startedPartId = await socialPostPartRepository.startFirst(
          {
            now: new Date(),
            socialPostTargetId: target.id,
            workspaceId: target.workspaceId,
          },
          tx,
        )
      }
      await this.recomputePost(tx, postId, target.workspaceId)
      return postId
    })
    if (!settled) {
      logger.info(
        { targetId: target.id },
        "social-post publish: claim lost, the result was not stored",
      )
      return false
    }
    if (outcome.kind === "published") {
      await chargePublishedTarget(target)
    }
    await announceSettledTarget(target, outcome)
    if (startedPartId) {
      await socialPostPartPublishService.enqueue(
        startedPartId,
        target.workspaceId,
      )
    }
    // A retry is not enqueued here: this runs inside the job that holds the
    // target's job id (BullMQ drops an add while it is active), so the scan
    // picks the target up at `nextAttemptAt`.
    return true
  }

  /** Recomputes the post's state from its targets, under the post's row lock. */
  private async recomputePost(
    tx: DatabaseClient,
    socialPostId: string,
    workspaceId: string,
  ): Promise<void> {
    await recomputePostInTx(tx, socialPostId, workspaceId)
  }

  private async assertTargetOfPost(input: {
    id: string
    targetId: string
    workspaceId: string
  }) {
    const target = await socialPostPublishRepository.findTargetStatus({
      id: input.targetId,
      workspaceId: input.workspaceId,
    })
    if (!target || target.socialPostId !== input.id) {
      throw notFoundException("Target not found")
    }
    return target
  }

  private async linkChannelPost(
    target: SocialTargetForPublish,
    externalPostId: string,
    destinationExternalId: string,
    permalink: string | null,
    publishedAt: Date,
  ): Promise<void> {
    await linkPublishedChannelPost(target, {
      destinationExternalId,
      externalPostId,
      permalink,
      publishedAt,
    })
  }

  private async enqueue(
    targetIds: readonly string[],
    workspaceId: string,
  ): Promise<void> {
    for (const socialPostTargetId of targetIds) {
      try {
        await postPublishQueue.add(
          PostPublishJobAction.publishTarget,
          {
            data: { socialPostTargetId, workspaceId },
            type: PostPublishJobAction.publishTarget,
          },
          { jobId: postPublishJobId(socialPostTargetId) },
        )
      } catch (err) {
        // The scan finds the target again: it is pending and due.
        logger.warn(
          { err: logSafe(err), targetId: socialPostTargetId },
          "social-post publish: failed to enqueue the job",
        )
      }
    }
  }
}

export const socialPostPublishService = new SocialPostPublishService()
