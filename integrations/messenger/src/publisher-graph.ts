import {
  createGraphFailureMapper,
  createGraphTransport,
  failure,
  scrubToken,
} from "@chatbotx.io/utils/meta-graph-errors"
import type { SocialPublishFailed } from "@chatbotx.io/utils/social-publisher"
import { API_URL, DEFAULT_API_VERSION } from "./constants"

/**
 * Facebook Page publishing transport and error mapping (pure; no DB, no logger).
 * Docs: https://developers.facebook.com/docs/pages-api/posts
 */

const UPLOAD_REQUEST_TIMEOUT_MS = 30_000

export type {
  GraphOutcome,
  GraphRequest,
} from "@chatbotx.io/utils/meta-graph-errors"

const mapGraphFailure = createGraphFailureMapper({
  networkLabel: "Facebook",
})

/** One Graph call, no automatic retry (see `createGraphTransport`). */
export const callGraph = createGraphTransport({
  baseUrl: API_URL,
  mapFailure: mapGraphFailure,
  networkLabel: "Facebook",
  version: DEFAULT_API_VERSION,
})

/** Host of the Reels / Stories upload service (documented in the Video API guides). */
const UPLOAD_HOST_URL = "https://rupload.facebook.com"
/** Host the Video API guide uses for `POST /{page-id}/videos`. */
export const VIDEO_HOST_URL = "https://graph-video.facebook.com"

const UPLOAD_HOSTNAME = "rupload.facebook.com"

/** The `upload_url` of a start call is used only when it is https on the documented upload host. */
export const isTrustedUploadUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === UPLOAD_HOSTNAME
  } catch {
    return false
  }
}

/**
 * Tells the upload service to fetch a hosted file (`file_url` header) into the
 * video created by an `upload_phase=start` call. Nothing is published by it.
 * Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */
export const uploadHostedVideo = async (request: {
  accessToken: string
  fileUrl: string
  /** The validated `upload_url` of the start call; the documented path is built when absent. */
  uploadUrl?: string
  videoId: string
}): Promise<{ ok: true } | { failure: SocialPublishFailed; ok: false }> => {
  let response: Response
  try {
    response = await fetch(
      request.uploadUrl ??
        `${UPLOAD_HOST_URL}/video-upload/${DEFAULT_API_VERSION}/${request.videoId}`,
      {
        headers: {
          Authorization: `OAuth ${request.accessToken}`,
          file_url: request.fileUrl,
        },
        method: "POST",
        signal: AbortSignal.timeout(UPLOAD_REQUEST_TIMEOUT_MS),
      },
    )
  } catch {
    return {
      failure: failure(
        "networkError",
        "network_error",
        "The upload request to Facebook failed or timed out before an answer arrived.",
        true,
      ),
      ok: false,
    }
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const succeeded =
    response.ok &&
    typeof body === "object" &&
    body !== null &&
    (body as { success?: unknown }).success === true
  if (succeeded) {
    return { ok: true }
  }
  const message = scrubToken(
    typeof body === "object" && body !== null
      ? JSON.stringify((body as { debug_info?: unknown }).debug_info ?? body)
      : `Facebook upload failed (HTTP ${response.status}).`,
    request.accessToken,
  ).slice(0, 300)
  // Nothing is published before the `finish` call: a failed upload is safe to retry.
  return {
    failure: failure(
      "mediaInvalid",
      `upload_http_${response.status}`,
      message,
      true,
    ),
    ok: false,
  }
}
