import { z } from "zod"
import type { PublishErrorScope } from "./publish-limits"
import type { SocialContentType } from "./social-account"
import type { SocialPostPartKind } from "./social-post"

/**
 * Contract between the publishing job (packages/business, apps/worker) and the
 * per-network publishers (integrations/*). Publishers are plain functions: they
 * take a token and ids, make HTTP calls, and never touch the database.
 */

/** Why a publish attempt did not finish. Mirrors the channel error categories plus `mediaInvalid`. */
export const socialPublishErrorCategories = z.enum([
  "rateLimited",
  "authFailed",
  "permissionDenied",
  "accountRestricted",
  "payloadInvalid",
  "mediaInvalid",
  "quotaExceeded",
  "notFound",
  "networkError",
  "unknown",
])
export type SocialPublishErrorCategory = z.infer<
  typeof socialPublishErrorCategories
>

export type SocialPublishMedia = {
  altText: string | null
  /** Length of a video in milliseconds when the media row knows it. */
  durationMs?: number | null
  mimeType: string
  /** Public, fetchable URL of the file (the network downloads it). */
  url: string
}

export type SocialPublishRequest = {
  accessToken: string
  contentType: SocialContentType
  /** Id of the page / profile on the network (the destination's `externalId`). */
  destinationExternalId: string
  linkUrl: string | null
  media: readonly SocialPublishMedia[]
  /** Options already validated against the registry; defaults applied. */
  options: Record<string, boolean | string | number>
  text: string | null
}

/** One follow-up of a published head: a thread reply or the first comment. Text only. */
export type SocialPublishPartRequest = {
  accessToken: string
  destinationExternalId: string
  kind: SocialPostPartKind
  /** The post this part answers: the head, or the previous part for a thread. */
  replyToExternalPostId: string
  text: string
}

export type SocialPublishPublished = {
  externalPostId: string
  permalink: string | null
  status: "published"
}

/** The network accepted the job but is still processing it (containers, video). */
export type SocialPublishPending = {
  /** Provider-side identity needed to resume, e.g. a container id. Stored on the target. */
  continuation: Record<string, string>
  retryAfterMs: number
  status: "pending"
}

export type SocialPublishFailed = {
  category: SocialPublishErrorCategory
  code: string
  message: string
  /** True only when the error proves nothing was created on the network. */
  provablyNotCreated: boolean
  /**
   * Rate-limit answers only: the platform's own reset hint in milliseconds
   * (`estimated_time_to_regain_access` is minutes, converted by the publisher).
   */
  retryAfterMs?: number
  /**
   * Limit answers only. `account`: the destination itself is limited or
   * restricted (counts toward pausing it). `app`: the whole app is throttled
   * (the target backs off; no destination is paused). `token`: a per-minute
   * request throttle on the access token (a short retry; no pause, no ladder).
   */
  scope?: PublishErrorScope
  status: "failed"
}

export type SocialPublishResult =
  | SocialPublishFailed
  | SocialPublishPending
  | SocialPublishPublished

export type SocialPublishStatusRequest = {
  accessToken: string
  /** Content type of the target; a publisher with several flows reads it to pick one. */
  contentType: SocialContentType
  /**
   * What the publisher stored (container ids, upload ids, the `phase` it
   * reached). It is the only identity a recovery has: a publisher must put every
   * provider-side id here as soon as it exists.
   */
  continuation: Record<string, string>
  destinationExternalId: string
  /** Options already validated against the registry. */
  options: Record<string, boolean | string | number>
  /**
   * Durably stores `continuation` (with the `FINAL_CALL_KEY` marker) before a
   * publisher sends the call that creates the post. Resolves false when the
   * write did not happen (the lease was lost): the publisher must then not send
   * the call. Absent where nothing stores a checkpoint (the call goes ahead
   * unmarked).
   */
  checkpoint?: (continuation: Record<string, string>) => Promise<boolean>
  /** The target's effective text, for a step that sends it after the upload. */
  text: string | null
}

/**
 * Continuation key written before the final, post-creating call (epoch
 * milliseconds). A continuation that holds it was possibly sent: it is never
 * sent again, a person decides.
 */
export const FINAL_CALL_KEY = "finalCallAt"

/** What a publisher returns when it meets a continuation whose final call may already have been sent. */
export const finalCallUnconfirmed = (): SocialPublishFailed => ({
  category: "unknown",
  code: "final_call_unconfirmed",
  message:
    "The call that creates the post was already sent and its result is unknown; the post may be live. Check the page before retrying.",
  provablyNotCreated: false,
  status: "failed",
})

/**
 * Stores the marker before the final call. `proceed: false` means the write was
 * lost and the call must not be sent (poll again later).
 */
export const checkpointFinalCall = async (
  request: Pick<SocialPublishStatusRequest, "checkpoint" | "continuation">,
  now: number = Date.now(),
): Promise<boolean> =>
  request.checkpoint
    ? await request.checkpoint({
        ...request.continuation,
        [FINAL_CALL_KEY]: String(now),
      })
    : true

export type SocialDeleteRequest = {
  accessToken: string
  externalPostId: string
}

export type SocialDeleteResult = { deleted: true } | SocialPublishFailed

/** Posts published in the quota window and the window's total. */
export type SocialPublishingLimit = {
  quotaTotal: number
  quotaUsage: number
}

/** One network's publishing functions; registered per provider by the job. */
export type SocialPublisher = {
  /**
   * The network's live publishing quota for a destination (Instagram
   * `content_publishing_limit`, Threads `threads_publishing_limit`). `null`
   * when the network has no endpoint or the call failed: the caller falls back
   * to the documented number.
   */
  getPublishingLimit?: (request: {
    accessToken: string
    destinationExternalId: string
  }) => Promise<SocialPublishingLimit | null>
  /**
   * The live quota of follow-up replies (Threads `reply_quota_usage` /
   * `reply_config`, 1000 per rolling 24 hours). `null` when unreadable: the part
   * goes ahead and the network's own answer decides.
   */
  getReplyLimit?: (request: {
    accessToken: string
    destinationExternalId: string
  }) => Promise<SocialPublishingLimit | null>
  /**
   * The live quota of deletes (Threads `delete_quota_usage` / `delete_config`,
   * 100 per rolling 24 hours). `null` when unreadable.
   */
  getDeleteLimit?: (request: {
    accessToken: string
    destinationExternalId: string
  }) => Promise<SocialPublishingLimit | null>
  checkStatus: (
    request: SocialPublishStatusRequest,
  ) => Promise<SocialPublishResult>
  delete: (request: SocialDeleteRequest) => Promise<SocialDeleteResult>
  publish: (request: SocialPublishRequest) => Promise<SocialPublishResult>
  /**
   * Publishes a follow-up part. Present only on a network whose endpoint is
   * verified; its result is read and recovered with `checkStatus`, like a head.
   */
  publishPart?: (
    request: SocialPublishPartRequest,
  ) => Promise<SocialPublishResult>
}

/**
 * Which publisher handles a destination. Instagram has two flavours (Instagram
 * Login on graph.instagram.com, Facebook Login on graph.facebook.com), so the
 * key is finer than `SocialProvider`.
 */
export const publisherKeys = z.enum([
  "facebook",
  "instagram",
  "instagramFacebook",
  "threads",
  "tiktok",
])
export type PublisherKey = z.infer<typeof publisherKeys>

export type SocialPublisherMap = Partial<Record<PublisherKey, SocialPublisher>>
