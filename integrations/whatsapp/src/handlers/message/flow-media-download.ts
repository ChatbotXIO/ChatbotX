import { readBodyWithLimit } from "@chatbotx.io/filesystem/bounded-fetch"
import type { FlowResponseFileFailureReason } from "@chatbotx.io/sdk"
import { API_URL } from "../../constants"
import { isRetryableHttpStatus } from "../../lib/http-status"
import { asString, isRecord } from "../../lib/value"

/** A definite outcome for the file; trying again would not change it. */
export class FlowMediaFailure extends Error {
  readonly reason: FlowResponseFileFailureReason

  constructor(reason: FlowResponseFileFailureReason) {
    super(reason)
    this.reason = reason
  }
}

/** A failure another attempt may fix; `retryAfterMs` is the server's hint. */
class TransientFlowMediaError extends Error {
  readonly retryAfterMs: number | null

  constructor(message: string, retryAfterMs: number | null) {
    super(message)
    this.retryAfterMs = retryAfterMs
  }
}

export type DownloadRequest = {
  accessToken: string
  version: string
  /**
   * The receiving number. Meta: when `phone_number_id` is included, "the
   * request will only be processed if" it matches the number the media was
   * uploaded on, so an id from another number is refused.
   */
  phoneNumberId: string
  deadlineAt: number
  requestTimeoutMs: number
  /** Total tries, the first included. */
  maxAttempts: number
  retryDelayMs: number
}

export type DownloadedMedia = { bytes: Buffer; mimeType: string }

/**
 * The files kept: exactly the types Meta lists for DocumentPicker's
 * `allowed-mime-types` (photos included). Meta lists no types for PhotoPicker,
 * so applying this list to photos too is this app's policy.
 */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/gzip",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-7z-compressed",
  "application/zip",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "text/plain",
  "video/mp4",
  "video/mpeg",
])

/**
 * A media URL lasts 5 minutes. When downloading it fails with 404, Meta says
 * to get a new URL and download again, so it is retried, never final.
 */
const RETRY_WITH_NEW_URL_STATUSES: ReadonlySet<number> = new Set([404])

type ResponseSource = "graph" | "cdn"

const normalizeMimeType = (mimeType: string): string =>
  mimeType.split(";")[0]?.trim().toLowerCase() ?? ""

export const isAllowedMimeType = (mimeType: string): boolean =>
  ALLOWED_MIME_TYPES.has(normalizeMimeType(mimeType))

/** Time left before the deadline; fails the file once it has passed. */
export const remainingMsOrFail = (deadlineAt: number): number => {
  const remainingMs = deadlineAt - Date.now()
  if (remainingMs <= 0) {
    throw new FlowMediaFailure("download_failed")
  }
  return remainingMs
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const readRetryAfterMs = (response: Response): number | null => {
  const seconds = Number(response.headers.get("retry-after"))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null
}

const isTransient = (response: Response, source: ResponseSource): boolean =>
  isRetryableHttpStatus(response.status) ||
  (source === "cdn" && RETRY_WITH_NEW_URL_STATUSES.has(response.status))

/** Frees the connection of a response whose body will not be read (again). */
const discardBody = async (response: Response): Promise<void> => {
  try {
    await response.body?.cancel()
  } catch {
    // The stream is already consumed or errored; nothing is left to free.
  }
}

/** Turns a failed response into the error that decides what happens next. */
const toResponseError = (response: Response, source: ResponseSource): Error =>
  isTransient(response, source)
    ? new TransientFlowMediaError(
        `HTTP ${response.status}`,
        readRetryAfterMs(response),
      )
    : new FlowMediaFailure("download_failed")

const fetchWithinDeadline = async (
  url: string,
  request: DownloadRequest,
  source: ResponseSource,
): Promise<Response> => {
  const remainingMs = remainingMsOrFail(request.deadlineAt)
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${request.accessToken}`,
      "User-Agent": "node",
    },
    signal: AbortSignal.timeout(
      Math.min(request.requestTimeoutMs, remainingMs),
    ),
  })
  if (response.ok) {
    return response
  }
  const error = toResponseError(response, source)
  await discardBody(response)
  throw error
}

const fetchMediaUrl = async (
  mediaId: string,
  request: DownloadRequest,
): Promise<{ url: string; mimeType: string }> => {
  const metadataUrl = new URL(
    `${API_URL}/${request.version}/${encodeURIComponent(mediaId)}`,
  )
  metadataUrl.searchParams.set("phone_number_id", request.phoneNumberId)
  const response = await fetchWithinDeadline(
    metadataUrl.toString(),
    request,
    "graph",
  )
  const body: unknown = await response.json()
  const url = isRecord(body) ? asString(body.url) : null
  const mimeType = isRecord(body) ? asString(body.mime_type) : null
  if (!(url && mimeType)) {
    throw new FlowMediaFailure("download_failed")
  }
  return { url, mimeType }
}

const downloadOnce = async (
  mediaId: string,
  maxBytes: number,
  request: DownloadRequest,
): Promise<DownloadedMedia> => {
  const media = await fetchMediaUrl(mediaId, request)
  if (!isAllowedMimeType(media.mimeType)) {
    throw new FlowMediaFailure("unsupported_type")
  }
  const response = await fetchWithinDeadline(media.url, request, "cdn")
  const bytes = await readBodyWithLimit(
    response,
    maxBytes,
    () => new FlowMediaFailure("too_large"),
  )
  return { bytes, mimeType: normalizeMimeType(media.mimeType) }
}

/** The pause before another attempt: the server's `Retry-After`, else the default. */
const retryDelayMs = (error: unknown, request: DownloadRequest): number =>
  (error instanceof TransientFlowMediaError ? error.retryAfterMs : null) ??
  request.retryDelayMs

/**
 * Downloads one file a customer uploaded in a WhatsApp Flow: the media's
 * metadata from Graph, then its bytes from the CDN, each attempt from a fresh
 * media URL. Every request is held to the response's deadline and the body is
 * read with a byte cap, never buffered whole first. A definite failure (too
 * large, refused) stops at once; network errors, timeouts, a body cut short,
 * throttling/5xx statuses and a 404 on the file's URL are tried again, unless
 * the pause they ask for no longer fits before the deadline.
 */
export const downloadFlowMedia = async (
  mediaId: string,
  maxBytes: number,
  request: DownloadRequest,
): Promise<DownloadedMedia> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await downloadOnce(mediaId, maxBytes, request)
    } catch (error) {
      const delayMs = retryDelayMs(error, request)
      const isLastAttempt =
        error instanceof FlowMediaFailure ||
        attempt >= request.maxAttempts ||
        delayMs >= request.deadlineAt - Date.now()
      if (isLastAttempt) {
        throw error
      }
      await sleep(delayMs)
    }
  }
}
