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
 * Thrown when neither the Graph media-id path nor the webhook's lookaside
 * URL can find the media: Meta's 7-day retention window has passed, or the
 * webhook is a stale redelivery for a call whose media has since been
 * purged. Distinct from `AttachmentTooLargeError` (a permanent-but-present
 * condition) and from any other error (transient — the caller retries).
 * Callers log and return rather than retry — re-fetching the same expired
 * id/URL can never succeed.
 */
export class WhatsappCallMediaGoneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhatsappCallMediaGoneError"
  }
}

/**
 * Thrown by the native recording/transcript fetch handlers (R8) when the
 * `WhatsappCall` row can't yet be resolved by `wacid` — the native-media
 * webhook can race the row-creating `calls` webhook/job on the same
 * delivery. Retryable: BullMQ's bounded backoff (see
 * `NATIVE_CALL_CAPTURE_RETRY_OPTIONS` in `@chatbotx.io/worker-config`,
 * ~1h total) gives the row time to land before giving up.
 */
export class WhatsappCallRowNotReadyError extends Error {
  constructor(wacid: string) {
    super(`whatsapp-call-row-not-ready: ${wacid}`)
    this.name = "WhatsappCallRowNotReadyError"
  }
}

const LOOKASIDE_FETCH_TIMEOUT_MS = 30_000

/**
 * Hosts the webhook-supplied media download URL is allowed to point at.
 * Meta serves call recordings/transcripts from `lookaside.fbsbx.com`
 * (documented on the call-recording/transcription pages) and the Graph host
 * when a fresh URL is minted through the Media API.
 */
const ALLOWED_MEDIA_HOSTS = new Set([
  "lookaside.fbsbx.com",
  "graph.facebook.com",
])

/**
 * The media download URL arrives inside a webhook body, and a manual
 * integration configured without an app secret accepts that body unverified
 * (`resolveSignaturePolicy`'s `legacy-unverified` path). Since the download
 * below presents the integration's WhatsApp access token as a bearer header,
 * an unvalidated URL would let a forged webhook redirect that token to an
 * attacker-controlled host. So the URL must be HTTPS and sit on a Meta host
 * (or a subdomain of one) before the token is ever attached.
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

/** Mirrors `integrations/whatsapp/src/constants.ts` (not re-exported
 * publicly by `@chatbotx.io/integration-whatsapp`) — duplicated here only
 * for the status-aware authoritative media-id lookup below; the actual
 * media bytes still come from the shared `downloadWhatsappMedia`. */
const GRAPH_API_URL = "https://graph.facebook.com"
const GRAPH_API_VERSION = "v23.0"
const MEDIA_ID_CLASSIFY_TIMEOUT_MS = 15_000

/**
 * Status-aware Graph Media API lookup (`GET /{media-id}`) used ONLY to
 * classify an id-path download failure as permanently gone vs transient.
 * Unlike the shared `downloadWhatsappMedia` (which resolves via
 * `whatsapp-api-js`'s `getBody`, always calling `response.json`
 * regardless of `response.ok` — so it discards the real HTTP status
 * entirely), this preserves the status so a genuine 404/410 from the
 * AUTHORITATIVE id lookup can be told apart from a transient 5xx/timeout/
 * network failure. See {@link downloadCallMedia}. A failure of this
 * classification call itself (network/timeout) is inconclusive and must
 * never be treated as proof the media is gone.
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
    // NOT authoritative on its own: the webhook's lookaside URL is only
    // valid for ~5 minutes, so a 404/410 here is frequently just staleness
    // on a retried job, never a reliable "gone" signal by itself. Only the
    // id-path's Graph-authoritative lookup (`isMediaIdGone`, consulted in
    // `downloadCallMedia` BEFORE this fallback is even reached) may raise
    // `WhatsappCallMediaGoneError` — this rethrows a plain Error instead so
    // BullMQ retries.
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
 * Downloads Meta-native call media (recording audio or transcript document).
 * Prefers the Graph Media API by id, reusing the exact
 * `retrieveMedia` + capped-fetch path the incoming-media pipeline uses
 * (`downloadWhatsappMedia`); falls back to the webhook's short-lived
 * (~5-min) lookaside URL only when the media-id path fails for a reason
 * other than a permanent size violation (an oversized body fails identically
 * on retry, so it is rethrown immediately rather than re-attempted via the
 * URL). A 404/410 from the fallback means the media is genuinely gone —
 * surfaced as {@link WhatsappCallMediaGoneError}. Never logs the downloaded
 * bytes themselves, only metadata.
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

    // Classify via the AUTHORITATIVE Graph media lookup BEFORE ever
    // consulting the webhook's short-lived lookaside URL — see
    // `isMediaIdGone`'s doc comment for why the shared `downloadWhatsappMedia`
    // failure alone can't distinguish "genuinely not found" from a
    // transient 5xx/timeout/network blip.
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
