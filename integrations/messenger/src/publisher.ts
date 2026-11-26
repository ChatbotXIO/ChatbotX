import {
  asDeleteFailure,
  failure,
  invalidPayload,
  scrubToken,
} from "@chatbotx.io/utils/meta-graph-errors"
import type {
  SocialDeleteRequest,
  SocialDeleteResult,
  SocialPublisher,
  SocialPublishFailed,
  SocialPublishMedia,
  SocialPublishRequest,
  SocialPublishResult,
  SocialPublishStatusRequest,
} from "@chatbotx.io/utils/social-publisher"
import {
  checkpointFinalCall,
  FINAL_CALL_KEY,
  finalCallUnconfirmed,
} from "@chatbotx.io/utils/social-publisher"
import { logger } from "./lib/logger"
import {
  callGraph,
  type GraphOutcome,
  isTrustedUploadUrl,
  uploadHostedVideo,
  VIDEO_HOST_URL,
} from "./publisher-graph"

/**
 * Facebook Page publisher. Verified against the official docs:
 * - Publish text/link (`POST /{page-id}/feed`: message, link), photo
 *   (`POST /{page-id}/photos`: url, caption, alt_text_custom -> {id, post_id}),
 *   delete (`DELETE /{post-id}` -> {success}), permalink
 *   `https://www.facebook.com/{post_id}`:
 *   https://developers.facebook.com/docs/pages-api/posts
 * - Multi-photo post: photos uploaded with `published=false`, then
 *   `POST /{page-id}/feed` with `message` and `attached_media[i]={"media_fbid":id}`;
 *   photos up to 10 MB (jpeg, bmp, png, gif, tiff):
 *   https://developers.facebook.com/docs/graph-api/reference/page/photos/
 * - Video: `POST /{page-id}/videos` on graph-video.facebook.com with `file_url`,
 *   `description`, `title` -> {id}; `DELETE /{video-id}` -> {success}:
 *   https://developers.facebook.com/docs/graph-api/reference/page/videos/ and
 *   https://developers.facebook.com/docs/graph-api/reference/video/
 * - Reel: `POST /{page-id}/video_reels` upload_phase=start -> {video_id,
 *   upload_url}; the `file_url` header is sent to `upload_url` (https on
 *   rupload.facebook.com only; else the documented path with the video id);
 *   status `GET /{video-id}?fields=status`; `upload_phase=finish`,
 *   `video_state=PUBLISHED`, `description`, `title`:
 *   https://developers.facebook.com/docs/video-api/guides/reels-publishing
 * - Stories: photo story `POST /{page-id}/photo_stories` (photo_id of an
 *   unpublished photo) -> {post_id}; video story `POST /{page-id}/video_stories`
 *   with the same start / upload / finish phases -> {post_id}:
 *   https://developers.facebook.com/documentation/video-api/page-stories-api
 * Direct feed/photo calls have no provider-side identity to query, so an
 * ambiguous failure after the request was sent is never `provablyNotCreated`.
 * UNVERIFIED: that `finish` may be sent as soon as the upload phase reports
 * `complete` (the guide shows it right after the upload), the permalink of a
 * video or reel, and that DELETE works on a story post id.
 */

const PERMALINK_BASE = "https://www.facebook.com"

const idOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const toPublished = (
  outcome: GraphOutcome,
  idKey: string,
): SocialPublishResult => {
  if (!outcome.ok) {
    return outcome.failure
  }
  const postId = idOf(outcome.data[idKey]) ?? idOf(outcome.data.id)
  if (postId === undefined) {
    return failure(
      "unknown",
      "invalid_response",
      "Facebook accepted the request but returned no post id; the post may exist.",
      false,
    )
  }
  return {
    externalPostId: postId,
    permalink: `${PERMALINK_BASE}/${postId}`,
    status: "published",
  }
}

const FLOW_KEY = "flow"
const VIDEO_ID_KEY = "videoId"
const PHASE_KEY = "phase"
const UPLOADED_PHASE = "uploaded"
const FINISHING_PHASE = "finishing"
const UPLOAD_POLL_MS = 15_000
const PROCESSING_POLL_MS = 30_000

type UploadFlow = "reel" | "videoStory"

const isUploadFlow = (flow: string | undefined): flow is UploadFlow =>
  flow === "reel" || flow === "videoStory"

const uploadEdge = (flow: UploadFlow): string =>
  flow === "reel" ? "video_reels" : "video_stories"

const isVideo = (media: SocialPublishMedia): boolean =>
  media.mimeType.startsWith("video/")

type IdsOutcome =
  | { ids: string[]; ok: true }
  | { failure: SocialPublishFailed; ok: false }

/** Unpublished photos are not posts: a failure here is safe to retry. */
const uploadUnpublishedPhotos = async (
  request: SocialPublishRequest,
): Promise<IdsOutcome> => {
  const outcomes = await Promise.all(
    request.media.map((file) =>
      callGraph({
        accessToken: request.accessToken,
        method: "POST",
        params: {
          published: "false",
          url: file.url,
          ...(file.altText ? { alt_text_custom: file.altText } : {}),
        },
        path: `${request.destinationExternalId}/photos`,
      }),
    ),
  )
  const ids: string[] = []
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      return {
        failure: { ...outcome.failure, provablyNotCreated: true },
        ok: false,
      }
    }
    const id = idOf(outcome.data.id)
    if (id === undefined) {
      return {
        failure: failure(
          "unknown",
          "invalid_response",
          "Facebook accepted a photo but returned no id.",
          true,
        ),
        ok: false,
      }
    }
    ids.push(id)
  }
  return { ids, ok: true }
}

/**
 * The photos and the feed call run in ONE attempt: the marker was written
 * before it, and the feed call leaves no provider-side identity, so an
 * ambiguous failure of that call is retried like any other unknown outcome
 * without an identity (the owner accepts a possible duplicate post).
 */
const publishMultiPhoto = async (
  request: SocialPublishRequest,
): Promise<SocialPublishResult> => {
  if (request.media.length < 1 || request.media.some(isVideo)) {
    return invalidPayload("A Facebook multi-photo post needs photos only.")
  }
  const photos = await uploadUnpublishedPhotos(request)
  if (!photos.ok) {
    return photos.failure
  }
  const params: Record<string, string> = {}
  photos.ids.forEach((id, index) => {
    params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id })
  })
  const text = request.text?.trim() ?? ""
  if (text.length > 0) {
    params.message = text
  }
  return toPublished(
    await callGraph({
      accessToken: request.accessToken,
      method: "POST",
      params,
      path: `${request.destinationExternalId}/feed`,
    }),
    "id",
  )
}

const publishStory = async (
  request: SocialPublishRequest,
): Promise<SocialPublishResult> => {
  const [file] = request.media
  if (request.media.length !== 1 || file === undefined) {
    return invalidPayload("A Facebook story needs exactly one file.")
  }
  if (isVideo(file)) {
    return await startUpload(request, "videoStory")
  }
  const photos = await uploadUnpublishedPhotos(request)
  if (!photos.ok) {
    return photos.failure
  }
  const outcome = await callGraph({
    accessToken: request.accessToken,
    method: "POST",
    params: { photo_id: photos.ids[0] ?? "" },
    path: `${request.destinationExternalId}/photo_stories`,
  })
  return await toStory(outcome, request)
}

/**
 * Story permalink from the documented `GET /{page-id}/stories` (per story:
 * `post_id`, `url`). One call, bounded by `since` (the only documented filter)
 * to a window that still holds a story published seconds ago; the entry whose
 * `post_id` is ours supplies the `url`. Anything else gives null, never a built URL.
 */
const STORY_LOOKUP_WINDOW_SECONDS = 600

const readStoryPermalink = async (
  request: { accessToken: string; destinationExternalId: string },
  postId: string,
): Promise<string | null> => {
  // The story is already published: a lookup that throws (a malformed error
  // body, a parser surprise) must never turn that into a failure.
  try {
    return await findStoryPermalink(request, postId)
  } catch (err) {
    logger.warn(
      { err, postId },
      "facebook publisher: the story permalink lookup failed",
    )
    return null
  }
}

const findStoryPermalink = async (
  request: { accessToken: string; destinationExternalId: string },
  postId: string,
): Promise<string | null> => {
  const read = await callGraph({
    accessToken: request.accessToken,
    method: "GET",
    params: {
      since: String(
        Math.floor(Date.now() / 1000) - STORY_LOOKUP_WINDOW_SECONDS,
      ),
    },
    path: `${request.destinationExternalId}/stories`,
  })
  if (!(read.ok && Array.isArray(read.data.data))) {
    return null
  }
  const stories: unknown[] = read.data.data
  for (const story of stories) {
    if (typeof story !== "object" || story === null) {
      continue
    }
    const entry = story as { post_id?: unknown; url?: unknown }
    if (String(entry.post_id ?? "") === postId) {
      const link = textOf(entry.url)
      return link?.startsWith("https://") ? link : null
    }
  }
  return null
}

const toStory = async (
  outcome: GraphOutcome,
  request: { accessToken: string; destinationExternalId: string },
): Promise<SocialPublishResult> => {
  if (!outcome.ok) {
    return outcome.failure
  }
  const postId =
    idOf(outcome.data.post_id) ?? String(outcome.data.post_id ?? "")
  if (postId === "") {
    return failure(
      "unknown",
      "invalid_response",
      "Facebook accepted the story but returned no post id; it may exist.",
      false,
    )
  }
  return {
    externalPostId: postId,
    permalink: await readStoryPermalink(request, postId),
    status: "published",
  }
}

const optionTitle = (
  options: Record<string, boolean | string | number>,
): Record<string, string> =>
  typeof options.title === "string" && options.title.length > 0
    ? { title: options.title }
    : {}

/** Feed video: one call with a hosted file; the returned video id is the identity. */
const publishVideo = async (
  request: SocialPublishRequest,
): Promise<SocialPublishResult> => {
  const [file] = request.media
  if (request.media.length !== 1 || file === undefined) {
    return invalidPayload("A Facebook video post needs exactly one video.")
  }
  const text = request.text?.trim() ?? ""
  const outcome = await callGraph({
    accessToken: request.accessToken,
    baseUrl: VIDEO_HOST_URL,
    method: "POST",
    params: {
      file_url: file.url,
      ...(text.length > 0 ? { description: text } : {}),
      ...optionTitle(request.options),
    },
    path: `${request.destinationExternalId}/videos`,
  })
  if (!outcome.ok) {
    return outcome.failure
  }
  const videoId = idOf(outcome.data.id)
  if (videoId === undefined) {
    return failure(
      "unknown",
      "invalid_response",
      "Facebook accepted the video but returned no id; the post may exist.",
      false,
    )
  }
  return {
    continuation: { [FLOW_KEY]: "video", [VIDEO_ID_KEY]: videoId },
    retryAfterMs: PROCESSING_POLL_MS,
    status: "pending",
  }
}

/** Reel / video story: start the session and hand the hosted file to the upload service. Nothing is public before `finish`. */
const startUpload = async (
  request: SocialPublishRequest,
  flow: UploadFlow,
): Promise<SocialPublishResult> => {
  const [file] = request.media
  if (request.media.length !== 1 || file === undefined || !isVideo(file)) {
    return invalidPayload(`A Facebook ${flow} needs exactly one video.`)
  }
  const started = await callGraph({
    accessToken: request.accessToken,
    method: "POST",
    params: { upload_phase: "start" },
    path: `${request.destinationExternalId}/${uploadEdge(flow)}`,
  })
  if (!started.ok) {
    return { ...started.failure, provablyNotCreated: true }
  }
  const videoId = idOf(started.data.video_id)
  if (videoId === undefined) {
    return failure(
      "unknown",
      "invalid_response",
      "Facebook started the upload but returned no video id.",
      true,
    )
  }
  // Absent → the documented built path; present but not a trusted https
  // rupload address (empty, a number, an object, another host) → refused.
  const rawUploadUrl: unknown = started.data.upload_url
  const uploadUrl = typeof rawUploadUrl === "string" ? rawUploadUrl : undefined
  if (
    rawUploadUrl !== undefined &&
    rawUploadUrl !== null &&
    !(uploadUrl && isTrustedUploadUrl(uploadUrl))
  ) {
    // Nothing was uploaded: the session only exists on Facebook's side.
    return failure(
      "mediaInvalid",
      "upload_url_untrusted",
      "Facebook returned an upload address that is not on its upload host.",
      true,
    )
  }
  const uploaded = await uploadHostedVideo({
    accessToken: request.accessToken,
    fileUrl: file.url,
    uploadUrl,
    videoId,
  })
  if (!uploaded.ok) {
    return uploaded.failure
  }
  return {
    continuation: {
      [FLOW_KEY]: flow,
      [PHASE_KEY]: UPLOADED_PHASE,
      [VIDEO_ID_KEY]: videoId,
    },
    retryAfterMs: UPLOAD_POLL_MS,
    status: "pending",
  }
}

const publish = async (
  request: SocialPublishRequest,
): Promise<SocialPublishResult> => {
  const { accessToken, destinationExternalId: pageId } = request
  const text = request.text?.trim() ?? ""

  if (request.contentType === "text") {
    if (text.length === 0) {
      return invalidPayload("A Facebook text post needs text.")
    }
    return toPublished(
      await callGraph({
        accessToken,
        method: "POST",
        params: { message: text },
        path: `${pageId}/feed`,
      }),
      "id",
    )
  }

  if (request.contentType === "link") {
    if (!request.linkUrl) {
      return invalidPayload("A Facebook link post needs a link.")
    }
    const params: Record<string, string> = { link: request.linkUrl }
    if (text.length > 0) {
      params.message = text
    }
    return toPublished(
      await callGraph({
        accessToken,
        method: "POST",
        params,
        path: `${pageId}/feed`,
      }),
      "id",
    )
  }

  if (request.contentType === "image") {
    const [image] = request.media
    if (request.media.length !== 1 || image === undefined) {
      return invalidPayload("A Facebook image post needs exactly one image.")
    }
    const params: Record<string, string> = { url: image.url }
    if (text.length > 0) {
      params.caption = text
    }
    return toPublished(
      await callGraph({
        accessToken,
        method: "POST",
        params,
        path: `${pageId}/photos`,
      }),
      "post_id",
    )
  }

  if (request.contentType === "carousel") {
    return await publishMultiPhoto(request)
  }
  if (request.contentType === "story") {
    return await publishStory(request)
  }
  if (request.contentType === "video") {
    return await publishVideo(request)
  }
  if (request.contentType === "reel") {
    return await startUpload(request, "reel")
  }
  return invalidPayload(
    `Facebook publishing does not support the ${request.contentType} content type yet.`,
  )
}

type VideoStatus = {
  error: string | null
  publishStatus: string | null
  uploadStatus: string | null
  videoStatus: string | null
}

const COMPLETE_VALUES: readonly string[] = ["complete", "completed"]

const textOf = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

const phaseOf = (
  status: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const phase = status[key]
  return typeof phase === "object" && phase !== null
    ? (phase as Record<string, unknown>)
    : {}
}

const errorMessageOf = (phase: Record<string, unknown>): string | null => {
  const error = phase.error
  return typeof error === "object" && error !== null
    ? (textOf((error as { message?: unknown }).message) ?? "error")
    : null
}

const parseVideoStatus = (data: Record<string, unknown>): VideoStatus => {
  const status =
    typeof data.status === "object" && data.status !== null
      ? (data.status as Record<string, unknown>)
      : {}
  const uploading = phaseOf(status, "uploading_phase")
  const processing = phaseOf(status, "processing_phase")
  const publishing = phaseOf(status, "publishing_phase")
  return {
    error:
      errorMessageOf(processing) ??
      errorMessageOf(publishing) ??
      (textOf(uploading.status) === "error" ? "upload error" : null),
    publishStatus: textOf(publishing.publish_status),
    uploadStatus: textOf(uploading.status),
    videoStatus: textOf(status.video_status),
  }
}

const absolutePermalink = (value: unknown): string | null => {
  const link = textOf(value)
  if (link === null) {
    return null
  }
  return link.startsWith("http") ? link : `${PERMALINK_BASE}${link}`
}

const publishedVideo = (
  videoId: string,
  data: Record<string, unknown>,
): SocialPublishResult => ({
  externalPostId: videoId,
  permalink: absolutePermalink(data.permalink_url),
  status: "published",
})

const pendingVideo = (
  continuation: Record<string, string>,
  retryAfterMs: number,
): SocialPublishResult => ({ continuation, retryAfterMs, status: "pending" })

/** The upload is complete: end the session and publish (the call that creates the reel / story). */
const finishUpload = async (
  request: SocialPublishStatusRequest,
  flow: UploadFlow,
  videoId: string,
): Promise<SocialPublishResult> => {
  // Stored before the call: if the worker dies in it, recovery sees the marker
  // and hands the target to a person instead of finishing a second time.
  if (!(await checkpointFinalCall(request))) {
    return pendingVideo(request.continuation, UPLOAD_POLL_MS)
  }
  const text = request.text?.trim() ?? ""
  const outcome = await callGraph({
    accessToken: request.accessToken,
    method: "POST",
    params: {
      upload_phase: "finish",
      video_id: videoId,
      ...(flow === "reel"
        ? {
            video_state: "PUBLISHED",
            ...(text.length > 0 ? { description: text } : {}),
            ...optionTitle(request.options),
          }
        : {}),
    },
    path: `${request.destinationExternalId}/${uploadEdge(flow)}`,
  })
  if (!outcome.ok) {
    return outcome.failure
  }
  if (flow === "videoStory") {
    return await toStory(outcome, request)
  }
  return pendingVideo(
    {
      [FLOW_KEY]: flow,
      [PHASE_KEY]: FINISHING_PHASE,
      [VIDEO_ID_KEY]: videoId,
    },
    PROCESSING_POLL_MS,
  )
}

/**
 * A failed status read says nothing about the post: it only describes the GET.
 * A rate-limited read keeps polling the same continuation (recovery bounds it
 * with the processing timeout). Any other failure, once the video exists and
 * publishes on its own, is never "provably not created": a person decides.
 */
const statusReadFailure = (
  request: SocialPublishStatusRequest,
  flow: string | undefined,
  readFailure: SocialPublishFailed,
): SocialPublishResult => {
  if (readFailure.category === "rateLimited") {
    return pendingVideo(
      request.continuation,
      Math.max(readFailure.retryAfterMs ?? 0, PROCESSING_POLL_MS),
    )
  }
  const publishesOnItsOwn =
    flow === "video" || request.continuation[PHASE_KEY] === FINISHING_PHASE
  return publishesOnItsOwn
    ? { ...readFailure, provablyNotCreated: false }
    : readFailure
}

const checkStatus = async (
  request: SocialPublishStatusRequest,
): Promise<SocialPublishResult> => {
  const flow = request.continuation[FLOW_KEY]
  const videoId = request.continuation[VIDEO_ID_KEY]
  if (
    isUploadFlow(flow) &&
    request.continuation[PHASE_KEY] !== FINISHING_PHASE &&
    request.continuation[FINAL_CALL_KEY] !== undefined
  ) {
    // The finish call may have been sent: a second one could post twice.
    return finalCallUnconfirmed()
  }
  if (!videoId || (flow !== "video" && !isUploadFlow(flow))) {
    return failure(
      "payloadInvalid",
      "no_continuation",
      "Only videos, reels and video stories have a pending state to check.",
      false,
    )
  }
  const read = await callGraph({
    accessToken: request.accessToken,
    method: "GET",
    params: { fields: "status,permalink_url" },
    path: videoId,
  })
  if (!read.ok) {
    return statusReadFailure(request, flow, read.failure)
  }
  const status = parseVideoStatus(read.data)
  if (status.error !== null || status.videoStatus === "upload_failed") {
    // The video object exists: a person decides, never an automatic second post.
    return failure(
      "mediaInvalid",
      "video_error",
      scrubToken(status.error ?? "The upload failed.", request.accessToken),
      flow === "video"
        ? false
        : request.continuation[PHASE_KEY] !== FINISHING_PHASE,
    )
  }
  if (status.videoStatus === "expired") {
    return failure(
      "mediaInvalid",
      "video_expired",
      "The video expired before it was published.",
      flow !== "video",
    )
  }
  if (flow === "video") {
    return status.videoStatus === "ready"
      ? publishedVideo(videoId, read.data)
      : pendingVideo(request.continuation, PROCESSING_POLL_MS)
  }
  if (request.continuation[PHASE_KEY] === FINISHING_PHASE) {
    return status.publishStatus === "published"
      ? publishedVideo(videoId, read.data)
      : pendingVideo(request.continuation, PROCESSING_POLL_MS)
  }
  if (
    status.uploadStatus !== null &&
    COMPLETE_VALUES.includes(status.uploadStatus)
  ) {
    return await finishUpload(request, flow, videoId)
  }
  return pendingVideo(request.continuation, UPLOAD_POLL_MS)
}

const deletePost = async (
  request: SocialDeleteRequest,
): Promise<SocialDeleteResult> => {
  const outcome = await callGraph({
    accessToken: request.accessToken,
    method: "DELETE",
    params: {},
    path: request.externalPostId,
  })
  if (!outcome.ok) {
    return asDeleteFailure(outcome.failure)
  }
  return outcome.data.success === false
    ? failure(
        "unknown",
        "delete_rejected",
        "Facebook did not delete the post.",
        false,
      )
    : { deleted: true }
}

export const facebookPublisher: SocialPublisher = {
  checkStatus,
  delete: deletePost,
  publish,
}
