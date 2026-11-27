import {
  asDeleteFailure,
  failure,
  invalidPayload,
} from "@chatbotx.io/utils/meta-graph-errors"
import {
  parsePublishingLimit,
  parseThreadsQuota,
  type ThreadsQuotaKind,
} from "@chatbotx.io/utils/publish-limits"
import type {
  SocialDeleteRequest,
  SocialDeleteResult,
  SocialPublisher,
  SocialPublishFailed,
  SocialPublishMedia,
  SocialPublishPartRequest,
  SocialPublishRequest,
  SocialPublishResult,
  SocialPublishStatusRequest,
} from "@chatbotx.io/utils/social-publisher"
import {
  checkpointFinalCall,
  FINAL_CALL_KEY,
  finalCallUnconfirmed,
} from "@chatbotx.io/utils/social-publisher"
import { callGraph } from "./publisher-graph"

/**
 * Threads publisher. Verified against the official docs:
 * - Container `POST /{user-id}/threads` (media_type TEXT|IMAGE, text, image_url),
 *   publish `POST /{user-id}/threads_publish` (creation_id), wait about 30 s
 *   before publishing: https://developers.facebook.com/docs/threads/posts
 * - Status `GET /{container-id}?fields=status,error_message` (EXPIRED, ERROR,
 *   FINISHED, IN_PROGRESS, PUBLISHED; poll once a minute, at most 5 minutes):
 *   https://developers.facebook.com/docs/threads/troubleshooting
 * - `DELETE /{media-id}` deletes a post:
 *   https://developers.facebook.com/docs/threads/reference/publishing
 * - Video container (media_type=VIDEO, video_url, alt_text up to 1000
 *   characters) and carousel (a container per item with is_carousel_item=true,
 *   then media_type=CAROUSEL with children, 2 to 20 items; text only on the
 *   carousel container): https://developers.facebook.com/docs/threads/posts
 *   and https://developers.facebook.com/docs/threads/reference/publishing
 * - `DELETE /{media-id}` needs the `threads_delete` permission and is limited
 *   to 100 per day per account:
 *   https://developers.facebook.com/docs/threads/posts/delete-posts
 * - A follow-up part is a TEXT container with `reply_to_id` (the id of the post
 *   to answer), published like any container; `threads_manage_replies` is in
 *   the connect scopes already:
 *   https://developers.facebook.com/docs/threads/reference/publishing
 *   Text limit: 500 characters, an emoji counting as its UTF-8 bytes
 *   (https://developers.facebook.com/docs/threads/posts).
 * UNVERIFIED: the `permalink` field on a published media (used by the existing
 * listing in apis/post.ts, not in the pages above).
 */

/**
 * The posts guide says to wait about 30 seconds before publishing; the
 * troubleshooting page recommends reading a container's status "once per
 * minute, for no more than 5 minutes":
 * https://developers.facebook.com/docs/threads/troubleshooting
 */
const PUBLISH_WAIT_MS = 30_000
const IN_PROGRESS_RETRY_MS = 60_000
const STATUS_POLL_MAX_MS = 5 * 60_000
/** Continuation key: epoch milliseconds when the container's status polling began. */
const POLL_STARTED_KEY = "pollStartedAt"
const POLL_TIMEOUT_CODE = "container_poll_timeout"
const CONTAINER_ID_KEY = "containerId"

const idOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const PHASE_KEY = "phase"
const CHILDREN_PHASE = "children"
const CHILDREN_KEY = "childIds"
const CHILD_ID_SEPARATOR = ","
const CHILD_POLL_MS = 60_000

const isVideo = (media: SocialPublishMedia): boolean =>
  media.mimeType.startsWith("video/")

const mediaParams = (
  file: SocialPublishMedia,
  extra: Record<string, string>,
): Record<string, string> => ({
  ...extra,
  ...(isVideo(file)
    ? { media_type: "VIDEO", video_url: file.url }
    : { image_url: file.url, media_type: "IMAGE" }),
  ...(file.altText ? { alt_text: file.altText } : {}),
})

type ContainerOutcome =
  | { containerId: string; ok: true }
  | { failure: SocialPublishFailed; ok: false }

/** A container is not a post: nothing is public until threads_publish, so a failure here is safe to retry. */
const createContainer = async (
  request: Pick<SocialPublishRequest, "accessToken" | "destinationExternalId">,
  params: Record<string, string>,
): Promise<ContainerOutcome> => {
  const outcome = await callGraph({
    accessToken: request.accessToken,
    method: "POST",
    params,
    path: `${request.destinationExternalId}/threads`,
  })
  if (!outcome.ok) {
    return {
      failure: { ...outcome.failure, provablyNotCreated: true },
      ok: false,
    }
  }
  const containerId = idOf(outcome.data.id)
  if (containerId === undefined) {
    return {
      failure: failure(
        "unknown",
        "invalid_response",
        "Threads accepted the request but returned no container id.",
        true,
      ),
      ok: false,
    }
  }
  return { containerId, ok: true }
}

const pollClockOf = (now: number): Record<string, string> => ({
  [POLL_STARTED_KEY]: String(now),
})

/** Whether the status polling of a continuation has run longer than the docs recommend. */
const isPollExpired = (
  continuation: Record<string, string>,
  now: number,
): boolean => {
  const startedAt = Number(continuation[POLL_STARTED_KEY])
  return Number.isFinite(startedAt) && now - startedAt > STATUS_POLL_MAX_MS
}

/** The continuation of a still pending poll: keeps its clock, or starts one for an older continuation. */
const keepPolling = (
  continuation: Record<string, string>,
  now: number,
): Record<string, string> =>
  continuation[POLL_STARTED_KEY] === undefined
    ? { ...continuation, ...pollClockOf(now) }
    : continuation

/** Nothing was published: a new container (a retry) may succeed where this one stalled. */
const pollTimeout = (): SocialPublishResult =>
  failure(
    "unknown",
    POLL_TIMEOUT_CODE,
    "Threads did not finish processing the media within 5 minutes.",
    true,
  )

const pendingContainer = (
  containerId: string,
  retryAfterMs: number,
): SocialPublishResult => ({
  continuation: {
    [CONTAINER_ID_KEY]: containerId,
    ...pollClockOf(Date.now()),
  },
  retryAfterMs,
  status: "pending",
})

const publishCarousel = async (
  request: SocialPublishRequest,
): Promise<SocialPublishResult> => {
  if (request.media.length === 0) {
    return invalidPayload("A Threads carousel needs at least two files.")
  }
  const created = await Promise.all(
    request.media.map((file) =>
      createContainer(request, mediaParams(file, { is_carousel_item: "true" })),
    ),
  )
  const failed = created.find((entry) => !entry.ok)
  if (failed && !failed.ok) {
    return failed.failure
  }
  // The child ids are the provider-side identity from now on.
  return {
    continuation: {
      [CHILDREN_KEY]: created
        .flatMap((entry) => (entry.ok ? [entry.containerId] : []))
        .join(CHILD_ID_SEPARATOR),
      [PHASE_KEY]: CHILDREN_PHASE,
      ...pollClockOf(Date.now()),
    },
    retryAfterMs: PUBLISH_WAIT_MS,
    status: "pending",
  }
}

const publish = async (
  request: SocialPublishRequest,
): Promise<SocialPublishResult> => {
  const text = request.text?.trim() ?? ""
  const params: Record<string, string> = {}

  if (request.contentType === "carousel") {
    return await publishCarousel(request)
  }
  if (request.contentType === "text") {
    if (text.length === 0) {
      return invalidPayload("A Threads text post needs text.")
    }
    params.media_type = "TEXT"
    params.text = text
  } else if (
    request.contentType === "image" ||
    request.contentType === "video"
  ) {
    const [file] = request.media
    if (request.media.length !== 1 || file === undefined) {
      return invalidPayload(
        `A Threads ${request.contentType} post needs exactly one file.`,
      )
    }
    Object.assign(params, mediaParams(file, text.length > 0 ? { text } : {}))
  } else {
    return invalidPayload(
      `Threads publishing does not support the ${request.contentType} content type yet.`,
    )
  }
  const created = await createContainer(request, params)
  if (!created.ok) {
    return created.failure
  }
  return pendingContainer(created.containerId, PUBLISH_WAIT_MS)
}

/**
 * A follow-up part: a TEXT container that replies to `reply_to_id`
 * (`reply_to_id` on `POST /{threads-user-id}/threads`, publishing reference),
 * then the same container read and publish as a head. The container is the
 * provider-side identity; the part is not public before `threads_publish`.
 */
const publishPart = async (
  request: SocialPublishPartRequest,
): Promise<SocialPublishResult> => {
  const text = request.text.trim()
  if (text.length === 0) {
    return invalidPayload("A Threads reply needs text.")
  }
  const created = await createContainer(request, {
    media_type: "TEXT",
    reply_to_id: request.replyToExternalPostId,
    text,
  })
  if (!created.ok) {
    return created.failure
  }
  return pendingContainer(created.containerId, PUBLISH_WAIT_MS)
}

/** Reads the items of a carousel; when all are ready, creates the carousel container. */
const advanceChildren = async (
  request: SocialPublishStatusRequest,
  childIds: readonly string[],
): Promise<SocialPublishResult> => {
  const statuses = await Promise.all(
    childIds.map((childId) =>
      callGraph({
        accessToken: request.accessToken,
        method: "GET",
        params: { fields: "status,error_message" },
        path: childId,
      }),
    ),
  )
  for (const status of statuses) {
    if (!status.ok) {
      return status.failure
    }
    if (status.data.status === "ERROR" || status.data.status === "EXPIRED") {
      return failure(
        "mediaInvalid",
        `container_${String(status.data.status).toLowerCase()}`,
        "Threads could not process one of the carousel files.",
        true,
      )
    }
  }
  if (
    statuses.some((status) => status.ok && status.data.status !== "FINISHED")
  ) {
    const now = Date.now()
    if (isPollExpired(request.continuation, now)) {
      return pollTimeout()
    }
    return {
      continuation: keepPolling(request.continuation, now),
      retryAfterMs: CHILD_POLL_MS,
      status: "pending",
    }
  }
  const text = request.text?.trim() ?? ""
  const created = await createContainer(request, {
    children: childIds.join(CHILD_ID_SEPARATOR),
    media_type: "CAROUSEL",
    ...(text.length > 0 ? { text } : {}),
  })
  if (!created.ok) {
    return created.failure
  }
  return pendingContainer(created.containerId, PUBLISH_WAIT_MS)
}

const publishContainer = async (
  request: SocialPublishStatusRequest,
  containerId: string,
): Promise<SocialPublishResult> => {
  // Stored before the call: if the worker dies in it, recovery sees the marker
  // and hands the target to a person instead of publishing again.
  if (!(await checkpointFinalCall(request))) {
    return {
      continuation: request.continuation,
      retryAfterMs: IN_PROGRESS_RETRY_MS,
      status: "pending",
    }
  }
  const outcome = await callGraph({
    accessToken: request.accessToken,
    method: "POST",
    params: { creation_id: containerId },
    path: `${request.destinationExternalId}/threads_publish`,
  })
  if (!outcome.ok) {
    return outcome.failure
  }
  const mediaId = idOf(outcome.data.id)
  if (mediaId === undefined) {
    return failure(
      "unknown",
      "invalid_response",
      "Threads accepted the request but returned no media id.",
      false,
    )
  }
  const details = await callGraph({
    accessToken: request.accessToken,
    method: "GET",
    params: { fields: "permalink" },
    path: mediaId,
  })
  return {
    externalPostId: mediaId,
    permalink: details.ok ? (idOf(details.data.permalink) ?? null) : null,
    status: "published",
  }
}

const checkStatus = async (
  request: SocialPublishStatusRequest,
): Promise<SocialPublishResult> => {
  if (request.continuation[FINAL_CALL_KEY] !== undefined) {
    return finalCallUnconfirmed()
  }
  if (request.continuation[PHASE_KEY] === CHILDREN_PHASE) {
    const childIds = (request.continuation[CHILDREN_KEY] ?? "")
      .split(CHILD_ID_SEPARATOR)
      .filter((id) => id.length > 0)
    if (childIds.length === 0) {
      return invalidPayload("The Threads continuation has no child ids.")
    }
    return await advanceChildren(request, childIds)
  }
  const containerId = request.continuation[CONTAINER_ID_KEY]
  if (!containerId) {
    return invalidPayload("The Threads continuation has no container id.")
  }
  const outcome = await callGraph({
    accessToken: request.accessToken,
    method: "GET",
    params: { fields: "status,error_message" },
    path: containerId,
  })
  if (!outcome.ok) {
    return outcome.failure
  }
  switch (outcome.data.status) {
    case "FINISHED":
      return await publishContainer(request, containerId)
    case "IN_PROGRESS": {
      const now = Date.now()
      if (isPollExpired(request.continuation, now)) {
        return pollTimeout()
      }
      return {
        continuation: keepPolling(request.continuation, now),
        retryAfterMs: IN_PROGRESS_RETRY_MS,
        status: "pending",
      }
    }
    case "ERROR":
    case "EXPIRED":
      return failure(
        "mediaInvalid",
        `container_${String(outcome.data.status).toLowerCase()}`,
        `Threads could not process the container${
          idOf(outcome.data.error_message)
            ? `: ${idOf(outcome.data.error_message)}`
            : "."
        }`,
        true,
      )
    case "PUBLISHED":
      // The status endpoint does not return the media id, so it cannot be recovered.
      return failure(
        "unknown",
        "container_already_published",
        "The container was already published; its media id is unknown.",
        false,
      )
    default:
      return failure(
        "unknown",
        "invalid_response",
        "Threads returned an unknown container status.",
        false,
      )
  }
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
        "Threads did not delete the post.",
        false,
      )
    : { deleted: true }
}

/** Live quota: official `threads_publishing_limit` (250 posts per rolling 24 hours). */
const getPublishingLimit = async (request: {
  accessToken: string
  destinationExternalId: string
}) => {
  const outcome = await callGraph({
    accessToken: request.accessToken,
    method: "GET",
    params: { fields: "quota_usage,config" },
    path: `${request.destinationExternalId}/threads_publishing_limit`,
  })
  return outcome.ok ? parsePublishingLimit(outcome.data) : null
}

/**
 * The reply or delete quota of `threads_publishing_limit` (documented fields
 * only: `reply_quota_usage`, `reply_config`, `delete_quota_usage`,
 * `delete_config`). `null` when the call failed or the shape is unknown.
 */
const readThreadsQuota =
  (kind: ThreadsQuotaKind) =>
  async (request: { accessToken: string; destinationExternalId: string }) => {
    const outcome = await callGraph({
      accessToken: request.accessToken,
      method: "GET",
      params: {
        fields:
          kind === "reply"
            ? "reply_quota_usage,reply_config"
            : "delete_quota_usage,delete_config",
      },
      path: `${request.destinationExternalId}/threads_publishing_limit`,
    })
    return outcome.ok ? parseThreadsQuota(outcome.data, kind) : null
  }

export const threadsPublisher: SocialPublisher = {
  checkStatus,
  delete: deletePost,
  getDeleteLimit: readThreadsQuota("delete"),
  getPublishingLimit,
  getReplyLimit: readThreadsQuota("reply"),
  publish,
  publishPart,
}
