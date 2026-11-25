import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type ExpiredSocialPart,
  type SocialPartForPublish,
  type SocialPartOutcome,
  type SocialPartRow,
  type SocialTargetError,
  socialPostPartRepository,
  socialPostPublishRepository,
} from "@chatbotx.io/database/repositories"
import {
  FINAL_CALL_KEY,
  type SocialPublisher,
  type SocialPublisherMap,
  type SocialPublishFailed,
  type SocialPublishResult,
} from "@chatbotx.io/utils/social-publisher"
import {
  PostPublishJobAction,
  postCheckPartJobId,
  postPartJobId,
  postPublishQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { conflictException, notFoundException } from "../errors"
import { logger } from "../logger"
import { messageUsageService } from "../message-usage/service"
import {
  loadPublishCredentials,
  type PublishCredentials,
} from "../publish-destination/credentials"
import { linkPublishedChannelPost } from "./link-channel-post"
import { announceSettledTarget, emitSocialPostChanged } from "./notify"
import { recomputePostInTx } from "./post-state"
import {
  asStringMap,
  claimInBatches,
  failure,
  logSafe,
  MIN_POLL_MS,
  recordPublishAuthFailureSafely,
} from "./publish-common"
import {
  classifyFailure,
  SOCIAL_POST_MAX_ATTEMPTS,
  toTargetError,
} from "./publish-outcome"
import { replyQuotaDeferral } from "./publish-pace"
import { chargePublishedTarget, SOCIAL_POST_QUOTA_ERROR } from "./publish-quota"
import { socialPostService } from "./service"
import type { SocialPostDto } from "./types"

/** How long one attempt holds a part before the recovery scan may take it over. */
export const SOCIAL_POST_PART_LEASE_MS = 10 * 60 * 1000
export const SOCIAL_POST_PART_DUE_PUSH_BACK_MS = 5 * 60 * 1000
export const SOCIAL_POST_PART_BATCH = 50
/** A reply container not finished this long after its creation is given up (nothing was published). */
const PART_PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000
/** Push job ids of a part stay clear of the head's (attempts 1..5). */
const PART_ATTEMPT_ID_STRIDE = 1000

export const SOCIAL_POST_PART_NOT_RESUMABLE_CODE = "socialPostPartNotResumable"
export const SOCIAL_POST_HEAD_UNCONFIRMED_CODE = "socialPostHeadUnconfirmed"

/** What one part job did. */
export type RunPartResult = "claimLost" | "deferred" | "settled" | "skipped"

export type PartResolution = "published" | "retry"

/**
 * Which post a part answers: the head for the first comment; for a thread part
 * the nearest earlier thread part that has a stored id, else the head (a part a
 * person marked published has no id, so the chain then continues from the one
 * before it).
 */
export const replyTargetOf = (
  part: Pick<SocialPartForPublish, "kind" | "position">,
  siblings: readonly Pick<
    SocialPartRow,
    "externalPostId" | "kind" | "position" | "status"
  >[],
  headExternalPostId: string,
): string => {
  if (part.kind === "firstComment") {
    return headExternalPostId
  }
  const earlier = siblings
    .filter(
      (sibling) =>
        sibling.kind === "threadPart" &&
        sibling.position < part.position &&
        sibling.status === "published" &&
        sibling.externalPostId,
    )
    .sort((a, b) => b.position - a.position)[0]
  return earlier?.externalPostId ?? headExternalPostId
}

/** Pushes and realtime events about a part ride on the target's channels. */
const partAttemptKey = (part: { attemptCount: number; position: number }) =>
  part.position * PART_ATTEMPT_ID_STRIDE + part.attemptCount

class SocialPostPartPublishService extends BaseService {
  /**
   * One attempt for one part: claim it (only when every part before it is
   * published and the head is out), check it, write the marker, call the
   * network, store the result. Every write presents the claim's lease.
   */
  async runPart(
    input: { id: string; workspaceId: string },
    publishers: SocialPublisherMap,
  ): Promise<RunPartResult> {
    const now = new Date()
    const claim = await socialPostPartRepository.claim({
      dueWindowMs: SOCIAL_POST_PART_DUE_PUSH_BACK_MS,
      id: input.id,
      leaseUntil: new Date(now.getTime() + SOCIAL_POST_PART_LEASE_MS),
      now,
      workspaceId: input.workspaceId,
    })
    if (!claim) {
      return "skipped"
    }
    const part = await socialPostPartRepository.findForPublish(input)
    if (!part) {
      return "skipped"
    }
    const state = { markerWritten: false }
    try {
      return await this.attempt(part, claim.leaseUntil, publishers, state)
    } catch (err) {
      logger.error(
        { err: logSafe(err), partId: part.id },
        "social-post part: attempt crashed",
      )
      // Before the marker nothing could have been created: retry. After it, a
      // person decides.
      const classified = classifyFailure(
        failure(
          "unknown",
          "internalError",
          "The publish attempt stopped unexpectedly.",
          !state.markerWritten,
        ),
        {
          attemptCount: part.attemptCount,
          now: new Date(),
          rateLimitAttempts: part.rateLimitAttempts,
        },
      )
      await this.settle(part, claim.leaseUntil, classified.outcome)
      return "settled"
    }
  }

  private async attempt(
    part: SocialPartForPublish,
    fence: Date,
    publishers: SocialPublisherMap,
    state: { markerWritten: boolean },
  ): Promise<RunPartResult> {
    const loaded = await loadPublishCredentials({
      publishDestinationId: part.destinationId,
      workspaceId: part.workspaceId,
    })
    if (!loaded.ok) {
      await this.settle(part, fence, {
        error: toTargetError(loaded.blocker),
        kind: "failed",
      })
      return "settled"
    }
    const { credentials } = loaded
    const blocked = this.preflightFailure(
      part,
      publishers[credentials.publisherKey],
    )
    if (blocked) {
      await this.settle(part, fence, {
        error: toTargetError(blocked),
        kind: "failed",
      })
      return "settled"
    }
    const publisher = publishers[credentials.publisherKey]
    const headId = part.headExternalPostId
    if (!(publisher?.publishPart && headId)) {
      return "skipped"
    }
    // The authoritative message-quota gate, before the marker: nothing was sent,
    // so the attempt is not spent. The head is out, so the part fails and a
    // person retries it after a top-up.
    if (!(await messageUsageService.hasRoom(part.workspaceId))) {
      return (await this.settle(part, fence, {
        error: SOCIAL_POST_QUOTA_ERROR,
        giveAttemptBack: true,
        kind: "failed",
      }))
        ? "settled"
        : "claimLost"
    }
    // The reply quota (Threads), before the marker: nothing was sent, so a
    // wait gives the claim back and spends no attempt.
    const waitUntil = await replyQuotaDeferral({
      accessToken: credentials.accessToken,
      destinationExternalId: credentials.destinationExternalId,
      destinationId: part.destinationId,
      now: new Date(),
      publisher,
    })
    if (waitUntil) {
      const released = await socialPostPartRepository.releaseClaim({
        fence,
        id: part.id,
        nextAttemptAt: waitUntil,
        workspaceId: part.workspaceId,
      })
      logger.info(
        { partId: part.id, released, until: waitUntil },
        "social-post part: deferred, the reply quota is used up",
      )
      return released ? "deferred" : "claimLost"
    }
    const siblings = await socialPostPartRepository.listForTargets({
      targetIds: [part.socialPostTargetId],
      workspaceId: part.workspaceId,
    })
    // The marker first: from here on a crash is never a safe retry.
    const marked = await socialPostPartRepository.markStarted({
      id: part.id,
      leaseUntil: fence,
      now: new Date(),
      workspaceId: part.workspaceId,
    })
    if (!marked) {
      return "claimLost"
    }
    state.markerWritten = true
    const result = await publisher.publishPart({
      accessToken: credentials.accessToken,
      destinationExternalId: credentials.destinationExternalId,
      kind: part.kind,
      replyToExternalPostId: replyTargetOf(part, siblings, headId),
      text: part.text,
    })
    return (await this.applyResult(part, fence, result, credentials))
      ? "settled"
      : "claimLost"
  }

  private preflightFailure(
    part: SocialPartForPublish,
    publisher: SocialPublisher | undefined,
  ): SocialPublishFailed | null {
    if (!publisher?.publishPart) {
      return failure(
        "unknown",
        "partsUnsupported",
        "This network cannot publish follow-up parts.",
        true,
      )
    }
    if (!part.headExternalPostId) {
      return failure(
        "unknown",
        "headIdentityMissing",
        "The first post has no stored id to reply to.",
        true,
      )
    }
    return null
  }

  /** Stores what a network call decided. `false` when the claim was lost. */
  private async applyResult(
    part: SocialPartForPublish,
    fence: Date,
    result: SocialPublishResult,
    credentials: PublishCredentials,
  ): Promise<boolean> {
    const now = new Date()
    if (result.status === "published") {
      return await this.settle(part, fence, {
        externalPostId: result.externalPostId,
        kind: "published",
        permalink: result.permalink,
        publishedAt: now,
      })
    }
    if (result.status === "pending") {
      return await this.settle(part, fence, {
        continuation: result.continuation,
        kind: "processing",
        nextCheckAt: new Date(
          now.getTime() + Math.max(result.retryAfterMs, MIN_POLL_MS),
        ),
      })
    }
    const classified = classifyFailure(result, {
      attemptCount: part.attemptCount,
      now,
      rateLimitAttempts: part.rateLimitAttempts,
    })
    const stored = await this.settle(part, fence, classified.outcome)
    if (stored && classified.authFailure) {
      await recordPublishAuthFailureSafely({
        category: classified.authFailure,
        credentials,
        workspaceId: part.workspaceId,
      })
    }
    return stored
  }

  /**
   * Stores a part's outcome and advances its target in one transaction, under
   * the lock order post row, then target, then parts: the next part becomes due
   * (or the target is published) only after this one is stored as published.
   */
  private async settle(
    part: Pick<
      SocialPartForPublish,
      | "attemptCount"
      | "id"
      | "position"
      | "socialPostId"
      | "socialPostTargetId"
      | "workspaceId"
    >,
    fence: Date,
    outcome: SocialPartOutcome,
  ): Promise<boolean> {
    const { workspaceId } = part
    const advanced = await db.transaction(async (tx) => {
      await socialPostPublishRepository.lockPost(
        { id: part.socialPostId, workspaceId },
        tx,
      )
      const targetId = await socialPostPartRepository.settle(
        { fence, id: part.id, outcome, workspaceId },
        tx,
      )
      if (!targetId) {
        return null
      }
      const next = await this.advanceTarget(tx, {
        outcome,
        socialPostTargetId: targetId,
        workspaceId,
      })
      await recomputePostInTx(tx, part.socialPostId, workspaceId)
      return next
    })
    if (!advanced) {
      logger.info(
        { partId: part.id },
        "social-post part: claim lost, the result was not stored",
      )
      return false
    }
    await this.announce(part, outcome)
    if (advanced.nextPartId) {
      await this.enqueue(advanced.nextPartId, workspaceId)
    }
    if (advanced.finishedHead) {
      await chargePublishedTarget({
        id: part.socialPostTargetId,
        workspaceId,
      })
      await linkPublishedChannelPost(advanced.finishedHead.target, {
        destinationExternalId:
          advanced.finishedHead.target.destinationExternalId,
        externalPostId: advanced.finishedHead.externalPostId,
        permalink: advanced.finishedHead.target.permalink,
        publishedAt: advanced.finishedHead.target.publishedAt ?? new Date(),
      })
    }
    // A retry is not enqueued here: this runs inside the job that holds the
    // part's job id (BullMQ drops an add while it is active), so the scan picks
    // the part up at `nextAttemptAt`.
    return true
  }

  /** What a part's outcome means for its target; runs inside the settle transaction. */
  private async advanceTarget(
    tx: DatabaseClient,
    input: {
      outcome: SocialPartOutcome
      socialPostTargetId: string
      workspaceId: string
    },
  ): Promise<{
    finishedHead: {
      externalPostId: string
      target: NonNullable<
        Awaited<ReturnType<typeof socialPostPublishRepository.findForPublish>>
      >
    } | null
    nextPartId: string | null
  }> {
    const { outcome, socialPostTargetId, workspaceId } = input
    const idle = { finishedHead: null, nextPartId: null }
    if (outcome.kind === "failed" || outcome.kind === "needsReview") {
      await socialPostPublishRepository.finishFromPart(
        {
          error: outcome.error,
          id: socialPostTargetId,
          outcome: outcome.kind,
          workspaceId,
        },
        tx,
      )
      return idle
    }
    if (outcome.kind !== "published") {
      return idle
    }
    const nextPartId = await socialPostPartRepository.startFirst(
      { now: new Date(), socialPostTargetId, workspaceId },
      tx,
    )
    if (nextPartId) {
      return { finishedHead: null, nextPartId }
    }
    const unsettled = await socialPostPartRepository.firstUnsettled(
      { socialPostTargetId, workspaceId },
      tx,
    )
    if (unsettled) {
      return idle
    }
    await socialPostPublishRepository.finishFromPart(
      {
        error: null,
        id: socialPostTargetId,
        outcome: "published",
        workspaceId,
      },
      tx,
    )
    const target = await socialPostPublishRepository.findForPublish(
      { id: socialPostTargetId, workspaceId },
      tx,
    )
    return {
      finishedHead: target?.externalPostId
        ? { externalPostId: target.externalPostId, target }
        : null,
      nextPartId: null,
    }
  }

  private async announce(
    part: Pick<
      SocialPartForPublish,
      | "attemptCount"
      | "position"
      | "socialPostId"
      | "socialPostTargetId"
      | "workspaceId"
    >,
    outcome: SocialPartOutcome,
  ): Promise<void> {
    const target = {
      attemptCount: partAttemptKey(part),
      id: part.socialPostTargetId,
      socialPostId: part.socialPostId,
      workspaceId: part.workspaceId,
    }
    if (outcome.kind === "failed" || outcome.kind === "needsReview") {
      await announceSettledTarget(target, outcome)
      return
    }
    await emitSocialPostChanged({
      socialPostId: part.socialPostId,
      status: "processing",
      targetId: part.socialPostTargetId,
      workspaceId: part.workspaceId,
    })
  }

  /** One scan tick: hands the due parts (retries, parts the queue lost) to the queue. */
  async scanDue(now: Date = new Date()): Promise<number> {
    return await claimInBatches({
      batchSize: SOCIAL_POST_PART_BATCH,
      claim: () =>
        socialPostPartRepository.claimDue({
          limit: SOCIAL_POST_PART_BATCH,
          now,
          pushBackUntil: new Date(
            now.getTime() + SOCIAL_POST_PART_DUE_PUSH_BACK_MS,
          ),
        }),
      handle: async (due) => {
        for (const part of due) {
          await this.enqueue(part.id, part.workspaceId)
        }
      },
    })
  }

  /**
   * Takes over parts whose lease ran out and hands each claim to its own job
   * (`runPartCheck`), so a slow network read never holds the scan. A job that
   * cannot be queued is not lost: the lease expires and the next tick claims
   * the part again.
   */
  async recoverExpired(now: Date = new Date()): Promise<number> {
    return await claimInBatches({
      batchSize: SOCIAL_POST_PART_BATCH,
      claim: () =>
        socialPostPartRepository.claimExpired({
          leaseUntil: new Date(now.getTime() + SOCIAL_POST_PART_LEASE_MS),
          limit: SOCIAL_POST_PART_BATCH,
          now,
        }),
      handle: async (expired) => {
        for (const part of expired) {
          await this.enqueuePartCheck(part)
        }
      },
    })
  }

  private async enqueuePartCheck(part: {
    id: string
    leaseUntil: Date
    workspaceId: string
  }): Promise<void> {
    const leaseUntilMs = part.leaseUntil.getTime()
    try {
      await postPublishQueue.add(
        PostPublishJobAction.checkPart,
        {
          data: {
            leaseUntilMs,
            socialPostPartId: part.id,
            workspaceId: part.workspaceId,
          },
          type: PostPublishJobAction.checkPart,
        },
        { jobId: postCheckPartJobId(part.id, leaseUntilMs) },
      )
    } catch (err) {
      logger.warn(
        { err: logSafe(err), partId: part.id },
        "social-post part: failed to enqueue the recovery job",
      )
    }
  }

  /**
   * One recovery job: reads the network for one claimed part, only while the
   * lease the scan gave it is still the stored one. Returns whether it was held.
   */
  async runPartCheck(
    input: { id: string; leaseUntil: Date; workspaceId: string },
    publishers: SocialPublisherMap,
  ): Promise<boolean> {
    const expired = await socialPostPartRepository.findExpiredClaim(input)
    if (!expired) {
      return false
    }
    try {
      await this.recoverOne(expired, publishers)
    } catch (err) {
      logger.error(
        { err: logSafe(err), partId: expired.id },
        "social-post part: recovery failed",
      )
    }
    return true
  }

  private async recoverOne(
    expired: ExpiredSocialPart,
    publishers: SocialPublisherMap,
  ): Promise<void> {
    const now = new Date()
    // The lease fence moves when the publisher stores its final-call marker.
    let fence = expired.leaseUntil
    const settleExpired = async (outcome: SocialPartOutcome) => {
      await this.settle(expired, fence, outcome)
    }
    // A reply whose final call was possibly sent is never failed (a retry would
    // create a new container and a second reply): a person decides.
    const stalled = (
      category: SocialTargetError["category"],
      code: string,
      message: string,
    ): SocialPartOutcome => {
      const marked = expired.continuation?.[FINAL_CALL_KEY] !== undefined
      return marked
        ? {
            error: {
              category,
              code,
              message: `${message} The reply may already be published; check the page, then mark it published or retry.`,
            },
            kind: "needsReview",
          }
        : { error: { category, code, message }, kind: "failed" }
    }
    if (!expired.continuation) {
      if (!expired.publishStartedAt) {
        await settleExpired(
          expired.attemptCount >= SOCIAL_POST_MAX_ATTEMPTS
            ? {
                error: {
                  category: "unknown",
                  code: "attemptsExhausted",
                  message: "The attempt stopped before reaching the network.",
                },
                kind: "failed",
              }
            : { error: null, kind: "retry", nextAttemptAt: now },
        )
        return
      }
      await settleExpired({
        error: {
          category: "unknown",
          code: "outcomeUnknown",
          message:
            "The attempt stopped after the request was sent; the part may exist on the network. Check it, then mark it published or retry.",
        },
        kind: "needsReview",
      })
      return
    }
    if (
      expired.publishStartedAt &&
      now.getTime() - expired.publishStartedAt.getTime() >
        PART_PROCESSING_TIMEOUT_MS
    ) {
      await settleExpired(
        stalled(
          "unknown",
          "processingTimeout",
          "The network did not finish processing the part in time.",
        ),
      )
      return
    }
    const part = await socialPostPartRepository.findForPublish({
      id: expired.id,
      workspaceId: expired.workspaceId,
    })
    if (!part) {
      await settleExpired(
        stalled(
          "unknown",
          "publisherUnavailable",
          "The destination of this part is gone.",
        ),
      )
      return
    }
    const loaded = await loadPublishCredentials({
      publishDestinationId: part.destinationId,
      workspaceId: part.workspaceId,
    })
    if (!loaded.ok) {
      const blocked = toTargetError(loaded.blocker)
      await settleExpired(
        stalled(blocked.category, blocked.code, blocked.message),
      )
      return
    }
    const { credentials } = loaded
    const publisher = publishers[credentials.publisherKey]
    if (!publisher) {
      await settleExpired(
        stalled(
          "unknown",
          "publisherUnavailable",
          "No publisher is registered for this network.",
        ),
      )
      return
    }
    const checkpoint = async (
      continuation: Record<string, string>,
    ): Promise<boolean> => {
      const nextCheckAt = new Date(Date.now() + SOCIAL_POST_PART_LEASE_MS)
      const stored = await this.settle(expired, fence, {
        continuation,
        kind: "processing",
        nextCheckAt,
      })
      if (stored) {
        fence = nextCheckAt
      }
      return stored
    }
    // Reading a container never creates a second reply; the call that does is
    // checkpointed first and never repeated (see `FINAL_CALL_KEY`).
    const result = await publisher.checkStatus({
      accessToken: credentials.accessToken,
      checkpoint,
      contentType: "text",
      continuation: asStringMap(expired.continuation),
      destinationExternalId: credentials.destinationExternalId,
      options: {},
      text: part.text,
    })
    await this.applyResult(
      { ...part, attemptCount: expired.attemptCount },
      fence,
      result,
      credentials,
    )
  }

  /**
   * A failed or unconfirmed part tries again; the head is never posted again.
   * `partId`, when given, must be the first unsettled part.
   */
  async retryPart(input: {
    id: string
    partId?: string
    targetId: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { id, targetId, workspaceId } = input
    const part = await this.resumablePart(input)
    const done = await db.transaction(async (tx) => {
      await socialPostPublishRepository.lockPost({ id, workspaceId }, tx)
      const resumed = await socialPostPublishRepository.resumeForParts(
        { id: targetId, workspaceId },
        tx,
      )
      if (!resumed) {
        return false
      }
      const reset = await socialPostPartRepository.resetForRetry(
        { id: part.id, now: new Date(), workspaceId },
        tx,
      )
      if (!reset) {
        return false
      }
      await recomputePostInTx(tx, id, workspaceId)
      return true
    })
    if (!done) {
      throw this.notResumable()
    }
    await this.enqueue(part.id, workspaceId)
    return await this.getAndAnnounce(input)
  }

  /** A person confirms the first unsettled part is on the network; the chain goes on after it. */
  async resolvePartAsPublished(input: {
    id: string
    partId?: string
    targetId: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const { id, targetId, workspaceId } = input
    const part = await this.resumablePart(input)
    if (part.status !== "needsReview") {
      throw conflictException(
        "Only a part waiting for review can be resolved",
        SOCIAL_POST_PART_NOT_RESUMABLE_CODE,
      )
    }
    const next = await db.transaction(async (tx) => {
      await socialPostPublishRepository.lockPost({ id, workspaceId }, tx)
      const resumed = await socialPostPublishRepository.resumeForParts(
        { id: targetId, workspaceId },
        tx,
      )
      if (!resumed) {
        return null
      }
      const resolved = await socialPostPartRepository.resolveAsPublished(
        { id: part.id, now: new Date(), workspaceId },
        tx,
      )
      if (!resolved) {
        return null
      }
      const advanced = await this.advanceTarget(tx, {
        outcome: {
          externalPostId: "",
          kind: "published",
          permalink: null,
          publishedAt: new Date(),
        },
        socialPostTargetId: targetId,
        workspaceId,
      })
      await recomputePostInTx(tx, id, workspaceId)
      return advanced
    })
    if (!next) {
      throw this.notResumable()
    }
    if (next.nextPartId) {
      await this.enqueue(next.nextPartId, workspaceId)
    }
    if (next.finishedHead) {
      await chargePublishedTarget({ id: targetId, workspaceId })
      await linkPublishedChannelPost(next.finishedHead.target, {
        destinationExternalId: next.finishedHead.target.destinationExternalId,
        externalPostId: next.finishedHead.externalPostId,
        permalink: next.finishedHead.target.permalink,
        publishedAt: next.finishedHead.target.publishedAt ?? new Date(),
      })
    }
    return await this.getAndAnnounce(input)
  }

  /** The part a retry or resolve acts on, and a check that a given `partId` is that one. */
  private async resumablePart(input: {
    partId?: string
    targetId: string
    workspaceId: string
  }): Promise<SocialPartRow> {
    const part = await socialPostPartRepository.firstUnsettled({
      socialPostTargetId: input.targetId,
      workspaceId: input.workspaceId,
    })
    if (!part) {
      throw notFoundException("Part not found")
    }
    if (input.partId && input.partId !== part.id) {
      throw this.notResumable()
    }
    return part
  }

  private notResumable() {
    return conflictException(
      "Only the first part that is not published can be retried or resolved",
      SOCIAL_POST_PART_NOT_RESUMABLE_CODE,
    )
  }

  private async getAndAnnounce(input: {
    id: string
    targetId: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const post = await socialPostService.get({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    await emitSocialPostChanged({
      socialPostId: input.id,
      status:
        post.targets.find((target) => target.id === input.targetId)?.status ??
        post.status,
      targetId: input.targetId,
      workspaceId: input.workspaceId,
    })
    return post
  }

  /** One job per part: the id is fixed, so a second request while one waits or runs is dropped. */
  async enqueue(socialPostPartId: string, workspaceId: string): Promise<void> {
    try {
      await postPublishQueue.add(
        PostPublishJobAction.publishPart,
        {
          data: { socialPostPartId, workspaceId },
          type: PostPublishJobAction.publishPart,
        },
        { jobId: postPartJobId(socialPostPartId) },
      )
    } catch (err) {
      // The scan finds the part again: it is pending and due.
      logger.warn(
        { err: logSafe(err), partId: socialPostPartId },
        "social-post part: failed to enqueue the job",
      )
    }
  }
}

export const socialPostPartPublishService = new SocialPostPartPublishService()
