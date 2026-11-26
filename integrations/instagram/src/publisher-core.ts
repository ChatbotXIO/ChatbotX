import {
  asDeleteFailure,
  failure,
  invalidPayload,
} from "@chatbotx.io/utils/meta-graph-errors"
import { parsePublishingLimit } from "@chatbotx.io/utils/publish-limits"
import type {
  PublisherKey,
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
import {
  type GraphOutcome,
  type GraphRequest,
  MEDIA_NOT_READY_CODE,
} from "./publisher-graph"

/**
 * Instagram publisher core, shared by the Instagram Login transport
 * (graph.instagram.com) and the Facebook Login transport (graph.facebook.com);
 * only the transport differs. Verified against the official docs:
 * - Reel container `POST /{ig-id}/media` (media_type=REELS, video_url, caption,
 *   share_to_feed, thumb_offset), story container (media_type=STORIES with
 *   image_url or video_url), carousel (a child container per item with
 *   is_carousel_item=true, media_type=VIDEO for a video, then a container with
 *   media_type=CAROUSEL, children, caption; up to 20 items; caption and
 *   location are not supported on children):
 *   https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
 * - Container `POST /{ig-id}/media` (image_url, caption, alt_text), publish
 *   `POST /{ig-id}/media_publish` (creation_id), status
 *   `GET /{container-id}?fields=status_code` (EXPIRED|ERROR|FINISHED|IN_PROGRESS|PUBLISHED;
 *   poll once a minute for at most 5 minutes): https://developers.facebook.com/docs/instagram-platform/content-publishing
 * - Error codes/subcodes: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/error-codes
 * UNVERIFIED: the `permalink` field read on the published media (used by the
 * existing media listing in apis/post.ts).
 * Delete (Facebook Login only): https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media
 * (`DELETE /{ig-media-id}`; UNVERIFIED whether the API wants DELETE or POST,
 * the page shows both). Instagram Login documents no delete.
 */

/**
 * The content publishing guide recommends reading a container's status once a
 * minute, for no more than 5 minutes:
 * https://developers.facebook.com/documentation/instagram-platform/content-publishing#container-publishing-status
 * Every `pending` answered by a status check keeps that cadence. The first
 * check, right after the container(s) are created, comes sooner: a short image
 * or reel is often finished within seconds, so waiting a full minute only
 * delays the post. It is one read, then the minute cadence applies.
 */
const FIRST_STATUS_CHECK_MS = 20_000
const STATUS_POLL_MS = 60_000
const STATUS_POLL_MAX_MS = 5 * 60_000
const CONTAINER_ID_KEY = "containerId"
/** Continuation key: epoch milliseconds when the container's status polling began. */
const POLL_STARTED_KEY = "pollStartedAt"
const POLL_TIMEOUT_CODE = "container_poll_timeout"
/** Code of the failure `delete` returns: the removal flow reports it as `unsupported`. */
const DELETE_UNSUPPORTED_CODE = "delete_unsupported"

const idOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const missingId = (what: string): SocialPublishResult =>
  failure(
    "unknown",
    "invalid_response",
    `Instagram accepted the request but returned no ${what}.`,
    false,
  )

/** Continuation key naming the publisher flavour that created the container. */
export const VIA_KEY = "via"
const CHILDREN_KEY = "childIds"
const PHASE_KEY = "phase"
const CHILDREN_PHASE = "children"
const CHILD_ID_SEPARATOR = ","

const isVideo = (media: SocialPublishMedia): boolean =>
  media.mimeType.startsWith("video/")

const pollClockOf = (now: number): Record<string, string> => ({
  [POLL_STARTED_KEY]: String(now),
})

/** Whether the status polling of a continuation has run longer than the guide allows. */
const isPollExpired = (
  continuation: Record<string, string>,
  now: number,
): boolean => {
  const startedAt = Number(continuation[POLL_STARTED_KEY])
  return Number.isFinite(startedAt) && now - startedAt >= STATUS_POLL_MAX_MS
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
const pollTimeout = (): SocialPublishFailed =>
  failure(
    "unknown",
    POLL_TIMEOUT_CODE,
    "Instagram did not finish processing the media within 5 minutes.",
    true,
  )

/** The Graph transport one Instagram flavour publishes through. */
export type InstagramGraphTransport = {
  callGraph: (request: GraphRequest) => Promise<GraphOutcome>
  /**
   * The flavour's API can delete published media. Only Instagram API with
   * Facebook Login documents `DELETE /{ig-media-id}`
   * (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media);
   * Instagram Login (graph.instagram.com) documents none.
   */
  canDelete: boolean
  /** Stored in every continuation so a recovery can detect a flavour switch. */
  via: Extract<PublisherKey, "instagram" | "instagramFacebook">
}

export const createInstagramPublisher = (
  transport: InstagramGraphTransport,
): SocialPublisher => {
  const { callGraph, canDelete, via } = transport
  /**
   * A container waiting to be published. `pollClock` keeps an earlier clock
   * (the carousel parent continues the children's five minutes); without it
   * the clock starts now.
   */
  const pendingContainer = (
    containerId: string,
    retryAfterMs: number,
    pollClock: Record<string, string> = pollClockOf(Date.now()),
  ): SocialPublishResult => ({
    continuation: {
      [CONTAINER_ID_KEY]: containerId,
      [VIA_KEY]: via,
      ...pollClock,
    },
    retryAfterMs,
    status: "pending",
  })

  /** A container is not a post: nothing is public until media_publish, so any failure here is safe to retry. */
  const createContainer = async (
    request: Pick<
      SocialPublishRequest,
      "accessToken" | "destinationExternalId"
    >,
    params: Record<string, string>,
  ): Promise<
    | { containerId: string; ok: true }
    | { failure: SocialPublishFailed; ok: false }
  > => {
    const outcome = await callGraph({
      accessToken: request.accessToken,
      method: "POST",
      params,
      path: `${request.destinationExternalId}/media`,
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
          "Instagram accepted the request but returned no container id.",
          true,
        ),
        ok: false,
      }
    }
    return { containerId, ok: true }
  }

  const withCaption = (
    params: Record<string, string>,
    text: string | null,
  ): Record<string, string> => {
    const caption = text?.trim() ?? ""
    return caption.length > 0 ? { ...params, caption } : params
  }

  type ParamsOutcome =
    | { ok: true; params: Record<string, string> }
    | { failure: SocialPublishFailed; ok: false }

  const singleMediaParams = (request: SocialPublishRequest): ParamsOutcome => {
    const [file] = request.media
    if (request.media.length !== 1 || file === undefined) {
      return {
        failure: invalidPayload(
          `An Instagram ${request.contentType} post needs exactly one file.`,
        ),
        ok: false,
      }
    }
    switch (request.contentType) {
      case "image": {
        const params: Record<string, string> = { image_url: file.url }
        if (file.altText) {
          params.alt_text = file.altText
        }
        return { ok: true, params: withCaption(params, request.text) }
      }
      case "reel": {
        const params: Record<string, string> = {
          media_type: "REELS",
          share_to_feed: String(request.options.shareToFeed ?? true),
          video_url: file.url,
        }
        const thumbOffset = request.options.thumbOffsetMs
        if (typeof thumbOffset === "number") {
          params.thumb_offset = String(Math.trunc(thumbOffset))
        }
        return { ok: true, params: withCaption(params, request.text) }
      }
      case "story":
        // The reference documents no caption for stories: none is sent.
        return {
          ok: true,
          params: isVideo(file)
            ? { media_type: "STORIES", video_url: file.url }
            : { image_url: file.url, media_type: "STORIES" },
        }
      default:
        return {
          failure: invalidPayload(
            `Instagram publishing does not support the ${request.contentType} content type.`,
          ),
          ok: false,
        }
    }
  }

  const publishCarousel = async (
    request: SocialPublishRequest,
  ): Promise<SocialPublishResult> => {
    if (request.media.length === 0) {
      return invalidPayload("An Instagram carousel needs at least one file.")
    }
    const created = await Promise.all(
      request.media.map((file) =>
        createContainer(
          request,
          isVideo(file)
            ? {
                is_carousel_item: "true",
                media_type: "VIDEO",
                video_url: file.url,
              }
            : {
                ...(file.altText ? { alt_text: file.altText } : {}),
                image_url: file.url,
                is_carousel_item: "true",
              },
        ),
      ),
    )
    const failed = created.find((entry) => !entry.ok)
    if (failed && !failed.ok) {
      return failed.failure
    }
    const childIds = created.flatMap((entry) =>
      entry.ok ? [entry.containerId] : [],
    )
    // The child ids are the provider-side identity from now on.
    return {
      continuation: {
        [CHILDREN_KEY]: childIds.join(CHILD_ID_SEPARATOR),
        [PHASE_KEY]: CHILDREN_PHASE,
        [VIA_KEY]: via,
        ...pollClockOf(Date.now()),
      },
      retryAfterMs: FIRST_STATUS_CHECK_MS,
      status: "pending",
    }
  }

  const publish = async (
    request: SocialPublishRequest,
  ): Promise<SocialPublishResult> => {
    if (request.contentType === "carousel") {
      return await publishCarousel(request)
    }
    const outcome = singleMediaParams(request)
    if (!outcome.ok) {
      return outcome.failure
    }
    const created = await createContainer(request, outcome.params)
    if (!created.ok) {
      return created.failure
    }
    return pendingContainer(created.containerId, FIRST_STATUS_CHECK_MS)
  }

  /** Reads the children of a carousel; when all are ready, creates the carousel container. */
  const advanceChildren = async (
    request: SocialPublishStatusRequest,
    childIds: readonly string[],
  ): Promise<SocialPublishResult> => {
    const statuses = await Promise.all(
      childIds.map((childId) =>
        callGraph({
          accessToken: request.accessToken,
          method: "GET",
          params: { fields: "status_code" },
          path: childId,
        }),
      ),
    )
    for (const status of statuses) {
      if (!status.ok) {
        return status.failure
      }
      if (
        status.data.status_code === "ERROR" ||
        status.data.status_code === "EXPIRED"
      ) {
        return failure(
          "mediaInvalid",
          `container_${String(status.data.status_code).toLowerCase()}`,
          "Instagram could not process one of the carousel files.",
          true,
        )
      }
    }
    if (
      statuses.some(
        (status) => status.ok && status.data.status_code !== "FINISHED",
      )
    ) {
      const now = Date.now()
      if (isPollExpired(request.continuation, now)) {
        return pollTimeout()
      }
      return {
        continuation: keepPolling(request.continuation, now),
        retryAfterMs: STATUS_POLL_MS,
        status: "pending",
      }
    }
    // The children's reads may have finished after the deadline: the parent is
    // only created inside it, and it keeps the same clock.
    const now = Date.now()
    if (isPollExpired(request.continuation, now)) {
      return pollTimeout()
    }
    const created = await createContainer(
      request,
      withCaption(
        {
          children: childIds.join(CHILD_ID_SEPARATOR),
          media_type: "CAROUSEL",
        },
        request.text,
      ),
    )
    if (!created.ok) {
      return created.failure
    }
    return pendingContainer(created.containerId, STATUS_POLL_MS, {
      [POLL_STARTED_KEY]: request.continuation[POLL_STARTED_KEY] ?? String(now),
    })
  }

  const fetchPermalink = async (
    accessToken: string,
    mediaId: string,
  ): Promise<string | null> => {
    const outcome = await callGraph({
      accessToken,
      method: "GET",
      params: { fields: "permalink" },
      path: mediaId,
    })
    if (!outcome.ok) {
      return null
    }
    return idOf(outcome.data.permalink) ?? null
  }

  const publishContainer = async (
    request: SocialPublishStatusRequest,
    containerId: string,
  ): Promise<SocialPublishResult> => {
    // The cap holds for the final publish attempt too: after it nothing is
    // published, so a retry may start a new container.
    if (isPollExpired(request.continuation, Date.now())) {
      return pollTimeout()
    }
    // Stored before the call: if the worker dies in it, recovery sees the marker
    // and hands the target to a person instead of publishing again.
    if (!(await checkpointFinalCall(request))) {
      return {
        continuation: request.continuation,
        retryAfterMs: STATUS_POLL_MS,
        status: "pending",
      }
    }
    // The checkpoint write can be slow: re-check the cap before the call that
    // publishes, so a checkpoint crossing the deadline sends nothing.
    if (isPollExpired(request.continuation, Date.now())) {
      return pollTimeout()
    }
    const outcome = await callGraph({
      accessToken: request.accessToken,
      method: "POST",
      params: { creation_id: containerId },
      path: `${request.destinationExternalId}/media_publish`,
    })
    if (!outcome.ok) {
      if (outcome.failure.code === MEDIA_NOT_READY_CODE) {
        // The marker is dropped on purpose: 9007 / 2207027 ("media not ready")
        // proves the publish call did not create the post, so polling again and
        // calling once more is safe. Any other answer keeps the stored marker.
        const now = Date.now()
        if (isPollExpired(request.continuation, now)) {
          return pollTimeout()
        }
        return {
          continuation: keepPolling(request.continuation, now),
          retryAfterMs: STATUS_POLL_MS,
          status: "pending",
        }
      }
      return outcome.failure
    }
    const mediaId = idOf(outcome.data.id)
    if (mediaId === undefined) {
      return missingId("media id")
    }
    return {
      externalPostId: mediaId,
      permalink: await fetchPermalink(request.accessToken, mediaId),
      status: "published",
    }
  }

  const checkStatus = async (
    request: SocialPublishStatusRequest,
  ): Promise<SocialPublishResult> => {
    if (request.continuation[FINAL_CALL_KEY] !== undefined) {
      return finalCallUnconfirmed()
    }
    // The cap is enforced before any further status read, container creation
    // or publish: a FINISHED answer after the deadline is not acted on.
    if (isPollExpired(request.continuation, Date.now())) {
      return pollTimeout()
    }
    if (request.continuation[PHASE_KEY] === CHILDREN_PHASE) {
      const childIds = (request.continuation[CHILDREN_KEY] ?? "")
        .split(CHILD_ID_SEPARATOR)
        .filter((id) => id.length > 0)
      if (childIds.length === 0) {
        return invalidPayload("The Instagram continuation has no child ids.")
      }
      return await advanceChildren(request, childIds)
    }
    const containerId = request.continuation[CONTAINER_ID_KEY]
    if (!containerId) {
      return invalidPayload("The Instagram continuation has no container id.")
    }
    const outcome = await callGraph({
      accessToken: request.accessToken,
      method: "GET",
      params: { fields: "status_code" },
      path: containerId,
    })
    if (!outcome.ok) {
      return outcome.failure
    }
    switch (outcome.data.status_code) {
      case "FINISHED":
        return await publishContainer(request, containerId)
      case "IN_PROGRESS": {
        const now = Date.now()
        if (isPollExpired(request.continuation, now)) {
          return pollTimeout()
        }
        return {
          continuation: keepPolling(request.continuation, now),
          retryAfterMs: STATUS_POLL_MS,
          status: "pending",
        }
      }
      case "ERROR":
      case "EXPIRED":
        return failure(
          "mediaInvalid",
          `container_${String(outcome.data.status_code).toLowerCase()}`,
          "Instagram could not process the media container.",
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
          "Instagram returned an unknown container status.",
          false,
        )
    }
  }

  /**
   * The DELETE answered 100/33. When the media cannot be read either, it no
   * longer exists (deleted earlier, in the app or by a repeat), so the answer
   * is `notFound`; any other outcome keeps the original `permissionDenied`.
   */
  const confirmMediaGone = async (
    request: SocialDeleteRequest,
    denied: SocialPublishFailed,
  ): Promise<SocialPublishFailed> => {
    const probe = await callGraph({
      accessToken: request.accessToken,
      method: "GET",
      params: { fields: "id" },
      path: request.externalPostId,
    })
    return !probe.ok && probe.failure.category === "notFound"
      ? { ...probe.failure, category: "notFound" }
      : denied
  }

  /**
   * `DELETE /{ig-media-id}` (needs `instagram_basic` and
   * `instagram_manage_contents`; posts, stories, reels and whole carousels, not
   * one child of a carousel). The reference shows both DELETE and POST for it:
   * UNVERIFIED which one the API answers; DELETE is what its text and its curl
   * example use. The DELETE itself is never retried automatically (a delete that
   * timed out may have succeeded). Graph answers 100/33 both for a media that
   * is gone and for a missing permission, so on that answer one read-only
   * `GET /{media-id}?fields=id` (needs only `instagram_basic`) tells them
   * apart: the media is also unreadable -> already removed; readable -> the
   * delete permission is missing.
   */
  const deletePost = async (
    request: SocialDeleteRequest,
  ): Promise<SocialDeleteResult> => {
    if (!canDelete) {
      return failure(
        "payloadInvalid",
        DELETE_UNSUPPORTED_CODE,
        "The Instagram API does not support deleting published media.",
        true,
      )
    }
    const outcome = await callGraph({
      accessToken: request.accessToken,
      method: "DELETE",
      params: {},
      path: request.externalPostId,
    })
    if (!outcome.ok) {
      const failed = asDeleteFailure(outcome.failure)
      return failed.category === "permissionDenied" &&
        outcome.failure.category === "notFound"
        ? await confirmMediaGone(request, failed)
        : failed
    }
    return outcome.data.success === false
      ? failure(
          "unknown",
          "delete_rejected",
          "Instagram did not delete the media.",
          false,
        )
      : { deleted: true }
  }

  /** Live quota: official `content_publishing_limit` (its docs say 50 and 100 in different places, so the live `quota_total` wins). */
  const getPublishingLimit = async (request: {
    accessToken: string
    destinationExternalId: string
  }) => {
    const outcome = await callGraph({
      accessToken: request.accessToken,
      method: "GET",
      params: { fields: "quota_usage,config" },
      path: `${request.destinationExternalId}/content_publishing_limit`,
    })
    return outcome.ok ? parsePublishingLimit(outcome.data) : null
  }

  return {
    checkStatus,
    delete: deletePost,
    getPublishingLimit,
    publish,
  }
}
