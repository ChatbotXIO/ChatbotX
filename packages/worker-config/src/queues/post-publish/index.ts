import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const PostPublishJobAction = {
  checkPart: "checkPart",
  checkTarget: "checkTarget",
  publishPart: "publishPart",
  publishTarget: "publishTarget",
  removeTarget: "removeTarget",
  runFeed: "runFeed",
} as const

type PostTargetJobPayload = {
  socialPostTargetId: string
  workspaceId: string
}

/** One destination of a composed post, ready to be published by the worker. */
export type PublishTargetJobData = {
  type: typeof PostPublishJobAction.publishTarget
  data: PostTargetJobPayload
}

/** One published destination to take down from its network (`removeFromChannels`). */
export type RemoveTargetJobData = {
  type: typeof PostPublishJobAction.removeTarget
  data: PostTargetJobPayload
}

/**
 * One read of a target the recovery scan took over. `leaseUntilMs` is the lease
 * the scan gave it: the job acts only while that lease is still the stored one.
 */
export type CheckTargetJobData = {
  type: typeof PostPublishJobAction.checkTarget
  data: PostTargetJobPayload & { leaseUntilMs: number }
}

/** One read of a part the recovery scan took over (same lease rule as a target). */
export type CheckPartJobData = {
  type: typeof PostPublishJobAction.checkPart
  data: { leaseUntilMs: number; socialPostPartId: string; workspaceId: string }
}

/** One follow-up part (thread reply or first comment) of a target whose head is published. */
export type PublishPartJobData = {
  type: typeof PostPublishJobAction.publishPart
  data: { socialPostPartId: string; workspaceId: string }
}

/** One check of one RSS/Atom feed (`SocialPostFeed`). */
export type RunFeedJobData = {
  type: typeof PostPublishJobAction.runFeed
  data: { feedId: string; workspaceId: string }
}

export type PostPublishJobData =
  | CheckPartJobData
  | CheckTargetJobData
  | PublishPartJobData
  | PublishTargetJobData
  | RemoveTargetJobData
  | RunFeedJobData

/**
 * One job per target. The job is removed when it ends, so the same id can be
 * enqueued again for a later attempt, and is dropped while a job with that id
 * is still waiting or running. The attempt is decided by the database (lease,
 * `attemptCount`), never by BullMQ retries: a retried job could publish twice.
 */
export const postPublishJobId = (socialPostTargetId: string): string =>
  `social-post-target-${socialPostTargetId}`

/**
 * One job per target and lease: a re-claim after the lease ran out gets a new
 * lease and so a new id, while a repeated enqueue of the same claim is dropped.
 */
export const postCheckTargetJobId = (
  socialPostTargetId: string,
  leaseUntilMs: number,
): string => `social-post-check-target-${socialPostTargetId}-${leaseUntilMs}`

export const postCheckPartJobId = (
  socialPostPartId: string,
  leaseUntilMs: number,
): string => `social-post-check-part-${socialPostPartId}-${leaseUntilMs}`

/** One job per part, so a long thread never holds one lease: parts run strictly one after the other. */
export const postPartJobId = (socialPostPartId: string): string =>
  `social-post-part-${socialPostPartId}`

/** One job per feed: a second request while a check is waiting or running is dropped. */
export const postFeedJobId = (feedId: string): string =>
  `social-post-feed-${feedId}`

/** Fixed id: a second request while the removal is waiting or running is dropped. */
export const postRemoveJobId = (socialPostTargetId: string): string =>
  `social-post-remove-${socialPostTargetId}`

export const postPublishQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<PostPublishJobData>(queueNames.enum.postPublish, {
      connection: getQueueConnection(queueNames.enum.postPublish),
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    })
