import { tiktokVideoOptions } from "@chatbotx.io/utils/post-publishing"
import type {
  SocialDeleteRequest,
  SocialDeleteResult,
  SocialPublisher,
  SocialPublishFailed,
  SocialPublishRequest,
  SocialPublishResult,
  SocialPublishStatusRequest,
} from "@chatbotx.io/utils/social-publisher"
import {
  callTiktok,
  failureFromFailReason,
  fetchPublishStatus,
  queryCreatorInfo,
  tiktokFailure,
} from "./publisher-api"
import { planUpload, readMediaSize, uploadChunks } from "./publisher-upload"

/**
 * TikTok publisher (Content Posting API, direct post of a video).
 *
 * Flow, each step stored before the next so nothing is posted twice:
 * 1. `publish`: creator info (must still be able to post; the chosen privacy
 *    level must be one of the creator's options), then `video/init/` with
 *    `FILE_UPLOAD`. TikTok documents no idempotency key, so the `publish_id`
 *    comes back as `pending` with the upload plan in `continuation` BEFORE any
 *    byte is sent; the job stores it, and a target is never initialised twice.
 * 2. `checkStatus` in phase `upload`: streams the file in chunks (one chunk in
 *    memory), within a time budget per call; the progress offset is returned in
 *    the continuation.
 * 3. `checkStatus` in phase `processing`: polls `status/fetch/` until
 *    PUBLISH_COMPLETE or FAILED. A public, moderated post exposes its id; a
 *    private (or not yet moderated) one never does, so the `publish_id` stands
 *    in as the external id.
 *
 * The upload uses FILE_UPLOAD because PULL_FROM_URL needs a TikTok-verified URL
 * prefix. Photo posts are not offered for the same reason.
 * UNVERIFIED: whether a network error during the upload leaves a post that TikTok
 * still publishes (the target then waits for review instead of retrying).
 */

const PHASE_KEY = "phase"
const UPLOAD_PHASE = "upload"
const PROCESSING_PHASE = "processing"
const UPLOAD_BUDGET_MS = 4 * 60 * 1000
const UPLOAD_RETRY_MS = 1000
const POLL_RETRY_MS = 15_000
/** A throttled or failed status read waits at least this long (TikTok's status limit is per minute). */
const STATUS_RETRY_MIN_MS = 60_000
/** Throttled status reads tolerated in a row (about ten minutes) before the target is handed to a person. */
const MAX_STATUS_THROTTLES = 10
const STATUS_THROTTLES_KEY = "statusThrottles"
const MILLISECONDS = 1000

const invalidPayload = (message: string): SocialPublishResult =>
  tiktokFailure("payloadInvalid", "invalid_payload", message, true)

const continuationOf = (
  fields: Record<string, string | number>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, String(value)]),
  )

type InitData = { publish_id?: string; upload_url?: string }

const publish = async (
  request: SocialPublishRequest,
): Promise<SocialPublishResult> => {
  if (request.contentType !== "video") {
    return invalidPayload("TikTok publishing supports videos only.")
  }
  const [file] = request.media
  if (request.media.length !== 1 || file === undefined) {
    return invalidPayload("A TikTok video post needs exactly one file.")
  }
  const parsed = tiktokVideoOptions.safeParse(request.options)
  if (!parsed.success) {
    return invalidPayload("The TikTok settings are not valid.")
  }
  const options = parsed.data

  const creator = await queryCreatorInfo(request.accessToken)
  if (!creator.ok) {
    return { ...creator.failure, provablyNotCreated: true }
  }
  const info = creator.data
  if (!info.privacyLevelOptions.includes(options.privacyLevel)) {
    return tiktokFailure(
      "payloadInvalid",
      "privacy_level_option_mismatch",
      "The privacy level is not one the TikTok account offers.",
      true,
    )
  }
  if (
    info.maxVideoPostDurationSec !== null &&
    file.durationMs != null &&
    file.durationMs > info.maxVideoPostDurationSec * MILLISECONDS
  ) {
    return tiktokFailure(
      "mediaInvalid",
      "duration_check_failed",
      "The video is longer than this TikTok account can post.",
      true,
    )
  }

  const size = await readMediaSize(file.url)
  if (size === null) {
    return tiktokFailure(
      "mediaInvalid",
      "source_size_unknown",
      "The size of the media file could not be read.",
      true,
    )
  }
  const plan = planUpload(size)
  const init = await callTiktok<InitData>({
    accessToken: request.accessToken,
    body: {
      post_info: {
        brand_content_toggle: options.commercialContent && options.brandContent,
        brand_organic_toggle: options.commercialContent && options.brandOrganic,
        disable_comment: info.commentDisabled || !options.allowComment,
        disable_duet: info.duetDisabled || !options.allowDuet,
        disable_stitch: info.stitchDisabled || !options.allowStitch,
        is_aigc: options.isAigc,
        privacy_level: options.privacyLevel,
        title: request.text ?? "",
        video_cover_timestamp_ms: options.coverTimestampMs,
      },
      source_info: {
        chunk_size: plan.chunkSize,
        source: "FILE_UPLOAD",
        total_chunk_count: plan.chunks.length,
        video_size: size,
      },
    },
    path: "/v2/post/publish/video/init/",
  })
  if (!init.ok) {
    return init.failure
  }
  const publishId = init.data.publish_id
  const uploadUrl = init.data.upload_url
  if (!(publishId && uploadUrl)) {
    return tiktokFailure(
      "unknown",
      "invalid_response",
      "TikTok accepted the request but returned no publish id.",
      false,
    )
  }
  return {
    continuation: continuationOf({
      mediaUrl: file.url,
      mimeType: file.mimeType,
      offset: 0,
      [PHASE_KEY]: UPLOAD_PHASE,
      publishId,
      uploadUrl,
      videoSize: size,
    }),
    retryAfterMs: UPLOAD_RETRY_MS,
    status: "pending",
  }
}

const pendingProcessing = (
  continuation: Record<string, string>,
): SocialPublishResult => ({
  continuation: { ...continuation, [PHASE_KEY]: PROCESSING_PHASE },
  retryAfterMs: POLL_RETRY_MS,
  status: "pending",
})

type ResumePoint = { kind: "complete" } | { kind: "resume"; offset: number }

/**
 * Where the upload really stands. A worker that died after TikTok accepted a
 * chunk but before the continuation was saved would resend that range and get
 * a 416, so the status endpoint's `uploaded_bytes` wins over the stored offset
 * when it is a planned chunk boundary (or the whole file). An unreadable,
 * absent, off-boundary or lower value keeps the stored offset.
 */
const resumeOffset = async (input: {
  accessToken: string
  publishId: string | undefined
  size: number
  storedOffset: number
}): Promise<ResumePoint> => {
  const { publishId, size, storedOffset } = input
  const stored: ResumePoint = { kind: "resume", offset: storedOffset }
  if (!publishId) {
    return stored
  }
  const outcome = await fetchPublishStatus(input.accessToken, publishId)
  if (!outcome.ok) {
    return stored
  }
  const reported = outcome.data.uploadedBytes
  if (reported === null || !Number.isInteger(reported) || reported < 0) {
    return stored
  }
  if (reported >= size) {
    return { kind: "complete" }
  }
  const isBoundary = planUpload(size).chunks.some(
    (chunk) => chunk.start === reported,
  )
  // Only ever move forward: a lagging counter must not resend accepted chunks.
  if (isBoundary && reported > storedOffset) {
    return { kind: "resume", offset: reported }
  }
  return stored
}

const advanceUpload = async (
  request: SocialPublishStatusRequest,
): Promise<SocialPublishResult> => {
  const { continuation } = request
  const { mediaUrl, mimeType, uploadUrl } = continuation
  const size = Number(continuation.videoSize)
  const offset = Number(continuation.offset ?? "0")
  if (!(mediaUrl && mimeType && uploadUrl) || Number.isNaN(size)) {
    return tiktokFailure(
      "unknown",
      "continuation_invalid",
      "The stored TikTok upload plan is incomplete.",
      false,
    )
  }
  const resume = await resumeOffset({
    accessToken: request.accessToken,
    publishId: continuation.publishId,
    size,
    storedOffset: offset,
  })
  if (resume.kind === "complete") {
    return pendingProcessing(continuation)
  }
  const progress = await uploadChunks({
    budgetMs: UPLOAD_BUDGET_MS,
    mediaUrl,
    mimeType,
    offset: resume.offset,
    size,
    uploadUrl,
  })
  if (progress.kind === "failed") {
    return progress.failure
  }
  if (progress.kind === "partial") {
    return {
      continuation: { ...continuation, offset: String(progress.offset) },
      retryAfterMs: UPLOAD_RETRY_MS,
      status: "pending",
    }
  }
  return pendingProcessing(continuation)
}

const withoutThrottles = (
  continuation: Record<string, string>,
): Record<string, string> => {
  const { [STATUS_THROTTLES_KEY]: _dropped, ...rest } = continuation
  return rest
}

/**
 * A failed status read. The `publish_id` already exists, so the post may be
 * created or about to be: the failure never claims "nothing was created" (a
 * retry would call init again and could publish a second video). A throttle
 * or a transient error keeps the continuation and reads again, a bounded
 * number of times; anything else ends in a failure that needs a person.
 */
const statusReadFailure = (
  continuation: Record<string, string>,
  failure: SocialPublishFailed,
): SocialPublishResult => {
  const transient =
    failure.category === "rateLimited" || failure.category === "networkError"
  if (!transient) {
    return { ...failure, provablyNotCreated: false }
  }
  const throttles = Number(continuation[STATUS_THROTTLES_KEY] ?? "0") + 1
  if (throttles > MAX_STATUS_THROTTLES) {
    return tiktokFailure(
      "unknown",
      "status_throttle_exhausted",
      "TikTok kept refusing the status check; the post may already be published.",
      false,
    )
  }
  return {
    continuation: {
      ...continuation,
      [STATUS_THROTTLES_KEY]: String(throttles),
    },
    retryAfterMs: Math.max(STATUS_RETRY_MIN_MS, failure.retryAfterMs ?? 0),
    status: "pending",
  }
}

const checkStatus = async (
  request: SocialPublishStatusRequest,
): Promise<SocialPublishResult> => {
  const publishId = request.continuation.publishId
  if (!publishId) {
    return tiktokFailure(
      "unknown",
      "continuation_invalid",
      "The TikTok continuation has no publish id.",
      false,
    )
  }
  if (request.continuation[PHASE_KEY] === UPLOAD_PHASE) {
    return await advanceUpload(request)
  }
  const outcome = await fetchPublishStatus(request.accessToken, publishId)
  if (!outcome.ok) {
    return statusReadFailure(request.continuation, outcome.failure)
  }
  const { failReason, postIds, status } = outcome.data
  switch (status) {
    case "PUBLISH_COMPLETE": {
      const [postId] = postIds
      return {
        externalPostId: postId ?? publishId,
        permalink: null,
        status: "published",
      }
    }
    case "FAILED":
      return failureFromFailReason(failReason)
    case "PROCESSING_UPLOAD":
    case "PROCESSING_DOWNLOAD":
    case "SEND_TO_USER_INBOX":
      return {
        continuation: withoutThrottles(request.continuation),
        retryAfterMs: POLL_RETRY_MS,
        status: "pending",
      }
    default:
      return tiktokFailure(
        "unknown",
        "invalid_response",
        "TikTok returned an unknown post status.",
        false,
      )
  }
}

/** The Content Posting API has no delete endpoint: a post is removed in the TikTok app. */
const deletePost = (
  _request: SocialDeleteRequest,
): Promise<SocialDeleteResult> =>
  Promise.resolve(
    tiktokFailure(
      "permissionDenied",
      "delete_not_supported",
      "TikTok does not let an app delete a post; delete it in the TikTok app.",
      false,
    ),
  )

export const tiktokPublisher: SocialPublisher = {
  checkStatus,
  delete: deletePost,
  publish,
}
