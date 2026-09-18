import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import {
  AttachmentTooLargeError,
  type DownloadedMedia,
  downloadWhatsappMedia,
  readBodyWithCap,
} from "../coexist/attachment-download"

/**
 * Thrown when neither the Graph media-id path nor the webhook's lookaside URL
 * can find the media — Meta's 7-day retention has passed, or the webhook is a
 * stale redelivery. Distinct from AttachmentTooLargeError (permanent-but-
 * present) and any other error (transient, retried). Callers log and return
 * rather than retry — an expired id/URL can never succeed.
 */
export class WhatsappCallMediaGoneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhatsappCallMediaGoneError"
  }
}

/**
 * Thrown by the native recording/transcript fetch handlers when the
 * WhatsappCall row can't yet be resolved by wacid — the native-media webhook
 * can race the row-creating calls webhook. Retryable via
 * NATIVE_CALL_CAPTURE_RETRY_OPTIONS (~1h total) to give the row time to land.
 */
export class WhatsappCallRowNotReadyError extends Error {
  constructor(wacid: string) {
    super(`whatsapp-call-row-not-ready: ${wacid}`)
    this.name = "WhatsappCallRowNotReadyError"
  }
}

const LOOKASIDE_FETCH_TIMEOUT_MS = 30_000

/**
 * Hosts the webhook-supplied media download URL is allowed to point at — Meta
 * serves recordings/transcripts from lookaside.fbsbx.com and the Graph host
 * when a fresh URL is minted via the Media API.
 */
const ALLOWED_MEDIA_HOSTS = new Set([
  "lookaside.fbsbx.com",
  "graph.facebook.com",
])

/**
 * An unverified webhook body carries this URL, and the download attaches the
 * integration's access token as a bearer header — so a forged webhook could
 * redirect the token to an attacker host unless the URL is HTTPS on a Meta host.
 */
const isTrustedMediaUrl = (url: string): boolean => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  for (const allowed of ALLOWED_MEDIA_HOSTS) {
    if (host === allowed || host.endsWith(`.${allowed}`)) {
      return true
    }
  }
  return false
}

/**
 * Mirrors integrations/whatsapp/src/constants.ts (not re-exported publicly) —
 * duplicated here only for the status-aware media-id lookup below; the actual
 * bytes still come from the shared downloadWhatsappMedia.
 */
const GRAPH_API_URL = "https://graph.facebook.com"
const GRAPH_API_VERSION = "v23.0"
const MEDIA_ID_CLASSIFY_TIMEOUT_MS = 15_000

/**
 * Classifies an id-path download failure as permanently gone (404/410) vs
 * transient, unlike the shared downloadWhatsappMedia which discards the real
 * HTTP status. A failure of this call itself is inconclusive, never gone.
 */
const isMediaIdGone = async (props: {
  mediaId: string
  accessToken: string
}): Promise<boolean> => {
  try {
    const response = await fetch(
      `${GRAPH_API_URL}/${GRAPH_API_VERSION}/${props.mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${props.accessToken}`,
          "User-Agent": "node",
        },
        signal: AbortSignal.timeout(MEDIA_ID_CLASSIFY_TIMEOUT_MS),
      },
    )
    return response.status === 404 || response.status === 410
  } catch {
    return false
  }
}

const fetchLookasideUrl = async (props: {
  url: string
  accessToken: string
  fallbackMime: string
  label: string
}): Promise<DownloadedMedia> => {
  if (!isTrustedMediaUrl(props.url)) {
    throw new WhatsappCallMediaGoneError(
      `[whatsapp-call-native-media] ${props.label} download URL is not a Meta media host; refusing to send the access token`,
    )
  }
  const response = await fetch(props.url, {
    headers: {
      Authorization: `Bearer ${props.accessToken}`,
      "User-Agent": "node",
    },
    signal: AbortSignal.timeout(LOOKASIDE_FETCH_TIMEOUT_MS),
  })
  if (response.status === 404 || response.status === 410) {
    // Not authoritative on its own: the webhook's lookaside URL is only valid
    // for ~5 minutes, so a 404/410 here is often just staleness on a retried
    // job, not a reliable gone signal. Only the id-path's Graph-authoritative
    // lookup may raise WhatsappCallMediaGoneError — this rethrows a plain Error
    // instead so BullMQ retries.
    throw new Error(
      `[whatsapp-call-native-media] ${props.label} lookaside URL expired or not found (${response.status}); not authoritative for permanent-gone`,
    )
  }
  if (!(response.ok && response.body)) {
    throw new Error(
      `[whatsapp-call-native-media] ${props.label} lookaside URL fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const bytes = await readBodyWithCap(response, `${props.label} attachment`)
  return {
    bytes,
    mimeType: response.headers.get("content-type") ?? props.fallbackMime,
    size: bytes.byteLength,
  }
}

/**
 * Downloads Meta-native call media by id, falling back to the webhook's
 * short-lived (~5-min) lookaside URL unless the id-path failed on a permanent
 * size violation (rethrown immediately, never retried via the URL).
 */
export const downloadCallMedia = async (props: {
  mediaId: string
  url: string
  auth: WhatsappAuthValue
  fallbackMime: string
  label: string
}): Promise<DownloadedMedia> => {
  try {
    return await downloadWhatsappMedia(
      props.mediaId,
      props.auth,
      props.fallbackMime,
    )
  } catch (err) {
    if (err instanceof AttachmentTooLargeError) {
      throw err
    }

    // Classify via the authoritative Graph media lookup before consulting the
    // webhook's short-lived lookaside URL — see isMediaIdGone's doc comment for
    // why the shared download failure alone can't distinguish genuinely-not-
    // found from a transient blip.
    if (
      await isMediaIdGone({
        mediaId: props.mediaId,
        accessToken: props.auth.tokens.accessToken,
      })
    ) {
      throw new WhatsappCallMediaGoneError(
        `[whatsapp-call-native-media] ${props.label} media id ${props.mediaId} not found at the authoritative Graph lookup (permanent)`,
      )
    }

    logger.warn(
      { err: normalizeError(err), label: props.label },
      "Whatsapp call native media: media-id download failed (transient); falling back to lookaside URL for this attempt",
    )
  }

  return await fetchLookasideUrl({
    url: props.url,
    accessToken: props.auth.tokens.accessToken,
    fallbackMime: props.fallbackMime,
    label: props.label,
  })
}

export { AttachmentTooLargeError } from "../coexist/attachment-download"
