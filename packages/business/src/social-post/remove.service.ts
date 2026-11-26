import {
  channelPostManagementRepository,
  socialPostRemovalRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import { distributedLock } from "@chatbotx.io/redis"
import { publisherCanRemove } from "@chatbotx.io/utils/post-publishing"
import type { SocialTargetRemovalStatus } from "@chatbotx.io/utils/social-post"
import type { SocialPublisherMap } from "@chatbotx.io/utils/social-publisher"
import {
  PostPublishJobAction,
  postPublishQueue,
  postRemoveJobId,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { conflictException, notFoundException } from "../errors"
import { logger } from "../logger"
import { loadPublishCredentials } from "../publish-destination/credentials"
import { emitSocialPostChanged } from "./notify"
import { logSafe, recordPublishAuthFailureSafely } from "./publish-common"
import { deleteQuotaExhausted } from "./publish-delete-quota"
import { toTargetError } from "./publish-outcome"

export const SOCIAL_POST_NOT_REMOVABLE_CODE = "socialPostNotRemovable"
/** Recorded on a target whose network or login offers no delete (Instagram Login, TikTok). */
export const SOCIAL_POST_REMOVAL_UNSUPPORTED_CODE = "removalUnsupported"
/** The network refused the delete: the connection predates the permission it needs (`threads_delete`, `instagram_manage_contents`). */
export const SOCIAL_POST_REMOVAL_PERMISSION_CODE = "removalPermissionMissing"
/** The removal job could not be added to the queue; nothing was sent to the network. */
const SOCIAL_POST_REMOVAL_QUEUE_FAILED_CODE = "removalQueueFailed"
/** Job states of a removal that is over: it ran to its end, either way. */
const FINISHED_JOB_STATES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
])
const REMOVE_LOCK_TTL_SECONDS = 10
/** Job states in which a removal is still going to run (or is running). */
const OPEN_JOB_STATES: ReadonlySet<string> = new Set([
  "active",
  "delayed",
  "prioritized",
  "waiting",
  "waiting-children",
])
/** The network's delete quota is used up (Threads: 100 per rolling 24 hours); nothing was sent. */
const REMOVAL_QUOTA_EXHAUSTED_CODE = "removalQuotaExhausted"

export type SocialPostRemovalResult = {
  targets: { status: SocialTargetRemovalStatus; targetId: string }[]
}

/** Publishers whose delete needs a permission older connections never granted. */
const REMOVAL_PERMISSION_PUBLISHERS: ReadonlySet<string> = new Set([
  "threads",
  "instagramFacebook",
])

const removalErrorFor = (
  error: { category: string; code: string; message: string },
  category: string,
  publisherKey: string,
): { category: string; code: string; message: string } => {
  if (error.code === "delete_unsupported") {
    return { ...error, code: SOCIAL_POST_REMOVAL_UNSUPPORTED_CODE }
  }
  if (
    category === "permissionDenied" &&
    REMOVAL_PERMISSION_PUBLISHERS.has(publisherKey)
  ) {
    return { ...error, code: SOCIAL_POST_REMOVAL_PERMISSION_CODE }
  }
  return error
}

/**
 * The targets a removal request acts on: all of them, or the named ones. A name
 * that is not a target of this post is refused, never silently skipped.
 */
const selectRemovalRows = <T extends { id: string }>(
  rows: T[],
  targetIds: string[] | undefined,
): T[] => {
  if (!targetIds) {
    return rows
  }
  const wanted = new Set(targetIds)
  const selected = rows.filter((row) => wanted.has(row.id))
  if (selected.length !== wanted.size) {
    throw notFoundException("Destination not found")
  }
  return selected
}

/** What one worker run did with its target. */
export type RemovalRunResult = "failed" | "removed" | "skipped"

class SocialPostRemoveService extends BaseService {
  /**
   * Asks for the published targets of the post to be taken down from their
   * networks: every target, or only `targetIds` when given (each must belong to
   * the post, else 404). The network calls run in the worker (one job per
   * target), never in the request. Repeating it is safe: a removed target
   * answers `removed`, and a job already waiting for the same target is dropped.
   * A selection with nothing published answers 409.
   */
  async request(input: {
    id: string
    targetIds?: string[]
    workspaceId: string
  }): Promise<SocialPostRemovalResult> {
    const { id, targetIds, workspaceId } = input
    const post = await socialPostRepository.findForWorkspace({
      id,
      workspaceId,
    })
    if (!post) {
      throw notFoundException("Post not found")
    }
    const allRows = await socialPostRemovalRepository.listForPost({
      socialPostId: id,
      workspaceId,
    })
    const rows = selectRemovalRows(allRows, targetIds)
    const targets = rows.map((row) => {
      let status: SocialTargetRemovalStatus = "queued"
      if (row.status !== "published") {
        status = "notPublished"
      } else if (row.removedAt) {
        status = "removed"
      } else if (!publisherCanRemove(row.publisherKey)) {
        status = "unsupported"
      }
      return { status, targetId: row.id }
    })
    if (targets.every((target) => target.status === "notPublished")) {
      throw conflictException(
        "The post has no published destination to remove",
        SOCIAL_POST_NOT_REMOVABLE_CODE,
      )
    }
    for (const target of targets) {
      if (target.status === "queued") {
        await this.start(target.targetId, workspaceId)
      }
    }
    return { targets }
  }

  /**
   * One removal: call the network's delete with the destination's token, then
   * record the result in the target. A "not found" answer counts as removed (the
   * post is gone, possibly by an earlier run that died before recording it). Any
   * other refusal leaves the target published with the reason in its error fields.
   */
  async runRemoval(
    input: { id: string; workspaceId: string },
    publishers: SocialPublisherMap,
  ): Promise<RemovalRunResult> {
    const { workspaceId } = input
    const target = await socialPostRemovalRepository.findForRemoval(input)
    if (target?.status !== "published" || target.removedAt) {
      return "skipped"
    }
    const loaded = await loadPublishCredentials({
      publishDestinationId: target.destinationId,
      workspaceId,
    })
    if (!loaded.ok) {
      await this.recordFailure(target, toTargetError(loaded.blocker))
      return "failed"
    }
    const { credentials } = loaded
    const publisher = publishers[credentials.publisherKey]
    if (!(publisher && target.externalPostId)) {
      await this.recordFailure(target, {
        category: "unknown",
        code: "publisherUnavailable",
        message: "No publisher or no network post id for this destination.",
      })
      return "failed"
    }
    // The network's delete quota (Threads: 100 per rolling 24 hours): refuse
    // with a clear reason instead of sending a call that would be rejected.
    if (
      await deleteQuotaExhausted({
        accessToken: credentials.accessToken,
        destinationExternalId: credentials.destinationExternalId,
        publisher,
      })
    ) {
      await this.recordFailure(target, {
        category: "rateLimited",
        code: REMOVAL_QUOTA_EXHAUSTED_CODE,
        message:
          "This account reached the network's limit of deletes per 24 hours. Try again later.",
      })
      return "failed"
    }
    let result: Awaited<ReturnType<typeof publisher.delete>>
    try {
      result = await publisher.delete({
        accessToken: credentials.accessToken,
        externalPostId: target.externalPostId,
      })
    } catch (err) {
      logger.error(
        { err: logSafe(err), targetId: target.id },
        "social-post removal: the delete call crashed",
      )
      await this.recordFailure(target, {
        category: "unknown",
        code: "internalError",
        message: "The removal stopped unexpectedly.",
      })
      return "failed"
    }
    if ("deleted" in result) {
      await this.markRemoved(target)
      return "removed"
    }
    // "Already gone" is the goal of a removal. This is also what a repeat sees
    // after a worker died between the network's delete and `markRemoved`, or
    // when the media was deleted in the network's own app. Instagram reports it
    // as `notFound` only after a read probe proved the media unreadable.
    if (result.category === "notFound") {
      await this.markRemoved(target)
      return "removed"
    }
    const error = toTargetError(result)
    await this.recordFailure(
      target,
      removalErrorFor(error, result.category, credentials.publisherKey),
    )
    if (result.category === "authFailed") {
      await recordPublishAuthFailureSafely({
        category: result.category,
        credentials,
        workspaceId,
      })
    }
    return "failed"
  }

  private async markRemoved(target: {
    id: string
    socialPostId: string
    workspaceId: string
  }): Promise<void> {
    const now = new Date()
    const changed = await socialPostRemovalRepository.markRemoved({
      id: target.id,
      now,
      workspaceId: target.workspaceId,
    })
    if (changed?.channelPostId) {
      await channelPostManagementRepository.markRemoved({
        id: changed.channelPostId,
        now,
        workspaceId: target.workspaceId,
      })
    }
    await emitSocialPostChanged({
      socialPostId: target.socialPostId,
      status: "published",
      targetId: target.id,
      workspaceId: target.workspaceId,
    })
  }

  private async recordFailure(
    target: { id: string; socialPostId: string; workspaceId: string },
    error: { category: string; code: string; message: string },
  ): Promise<void> {
    await socialPostRemovalRepository.recordFailure({
      error,
      id: target.id,
      workspaceId: target.workspaceId,
    })
    await emitSocialPostChanged({
      socialPostId: target.socialPostId,
      status: "published",
      targetId: target.id,
      workspaceId: target.workspaceId,
    })
  }

  /**
   * Starts one removal. A job still waiting or running for the target is
   * joined (its result is the answer, so its error is left alone); otherwise
   * the earlier error is cleared and a new job added. A job that cannot be
   * added leaves a failure on the row instead of nothing, then rethrows.
   */
  private async start(
    socialPostTargetId: string,
    workspaceId: string,
  ): Promise<void> {
    // One request at a time per target: the look at the job, the clearing of
    // the old error and the add must not interleave with another request's.
    // A lock that cannot be taken propagates, with nothing cleared.
    await distributedLock.runExclusive({
      fn: async () => {
        const jobId = postRemoveJobId(socialPostTargetId)
        const existing = await postPublishQueue.getJob(jobId)
        const state = existing ? await existing.getState() : "unknown"
        if (OPEN_JOB_STATES.has(state)) {
          return
        }
        // A finished job keeps its id and would swallow the new request. Only a
        // confirmed completed or failed one is removed, never a running one.
        if (existing && FINISHED_JOB_STATES.has(state)) {
          await existing.remove()
        }
        await socialPostRemovalRepository.clearError({
          id: socialPostTargetId,
          workspaceId,
        })
        try {
          await this.enqueue(socialPostTargetId, workspaceId)
        } catch (err) {
          await socialPostRemovalRepository.recordFailure({
            error: {
              category: "unknown",
              code: SOCIAL_POST_REMOVAL_QUEUE_FAILED_CODE,
              message: "The removal could not be queued. Try again.",
            },
            id: socialPostTargetId,
            workspaceId,
          })
          throw err
        }
      },
      key: `social-post-remove:${workspaceId}:${socialPostTargetId}`,
      timeoutInSeconds: REMOVE_LOCK_TTL_SECONDS,
    })
  }

  private async enqueue(
    socialPostTargetId: string,
    workspaceId: string,
  ): Promise<void> {
    await postPublishQueue.add(
      PostPublishJobAction.removeTarget,
      {
        data: { socialPostTargetId, workspaceId },
        type: PostPublishJobAction.removeTarget,
      },
      { jobId: postRemoveJobId(socialPostTargetId) },
    )
  }
}

export const socialPostRemoveService = new SocialPostRemoveService()
