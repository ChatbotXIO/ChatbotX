import { SdkException } from "@chatbotx.io/sdk"

/** A 429 (rate limit) or any 5xx is worth retrying; anything else is not. */
const isRetryableStatus = (status: number): boolean =>
  status === 429 || status >= 500

/**
 * `error.name` values meaning "the request never got an answer in time" —
 * ky aborts a request past its `timeout` with a `TimeoutError`, and a
 * caller-side `AbortSignal.timeout()` surfaces as `AbortError`. Neither
 * carries an HTTP status, so without this set they look identical to a
 * permanent 400 (the integrations' `FALLBACK_HTTP_STATUS` for an
 * unrecognised origin error).
 */
const TIMEOUT_ERROR_NAMES = new Set(["TimeoutError", "AbortError"])

/**
 * Node/undici socket-level failure codes that mean the connection died
 * mid-flight. Transient by nature — the same call typically succeeds on the
 * next attempt — and equally statusless.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
])

/**
 * Reads the raw provider error an `SdkException`-shaped wrapper carries.
 * Shared with `contact-scan/graph-error.ts`, which classifies the same wrapped
 * errors — one reader, so the two cannot drift.
 */
export const readOriginError = (error: unknown): unknown =>
  (error as { getOriginError?: () => unknown } | null)?.getOriginError?.()

/** The fields a statusless transport failure is recognised by. */
type TransportErrorSignature = { name?: unknown; code?: unknown }

/** Table lookup against both signature sets — no per-error-kind branching. */
const matchesTransientSignature = (candidate: unknown): boolean => {
  if (candidate == null || typeof candidate !== "object") {
    return false
  }
  const { name, code } = candidate as TransportErrorSignature
  return (
    (typeof name === "string" && TIMEOUT_ERROR_NAMES.has(name)) ||
    (typeof code === "string" && TRANSIENT_NETWORK_CODES.has(code))
  )
}

/**
 * Whether an error is a timeout / dropped connection rather than an answered
 * HTTP failure.
 *
 * Depth is exactly one `cause` hop — ky surfaces a socket error as a
 * `TypeError("fetch failed")` whose `cause` carries the real code — and, via
 * `isRetryable`'s wrapper branch, one `getOriginError()` hop. That matches
 * every shape the channel integrations actually throw; a hypothetical
 * double-wrapped error is not unwrapped recursively.
 */
const isTransientTransportError = (error: unknown): boolean =>
  matchesTransientSignature(error) ||
  matchesTransientSignature((error as { cause?: unknown } | null)?.cause)

/**
 * Whether an error is worth retrying — a 429 (rate limit), any 5xx, or a
 * statusless transport failure (request timeout / dropped socket).
 * Channel-agnostic, so both the coexist handlers and the contact-scan
 * classifier can depend on it without reaching into channel code.
 *
 * Recognises two shapes: the raw ky-style HTTP error (`error.response.status`)
 * AND the channel integrations' wrapped `SdkException`, which carries the
 * status as a FLAT `httpStatusCode` field (a `MessengerAPIException` /
 * `InstagramAPIException` has no `.response`). Both channels' `rescue()` wrap
 * every Graph failure into an `SdkException` before it reaches `withInlineRetry`,
 * so without the flat-field branch inline retry never fires for real provider
 * errors.
 *
 * A timeout is checked through the wrapper too: `parseOriginError` cannot map
 * a ky `TimeoutError` to a status, so it stamps the permanent-looking
 * `FALLBACK_HTTP_STATUS` (400) and keeps the real error only as
 * `getOriginError()`. Reading just the flat status there would classify every
 * slow `/conversations` page as a hard failure and terminalize the run on the
 * first timeout.
 */
export function isRetryable(error: unknown): boolean {
  if (isTransientTransportError(error)) {
    return true
  }

  if (error instanceof SdkException) {
    return (
      isRetryableStatus(error.httpStatusCode) ||
      isTransientTransportError(readOriginError(error))
    )
  }

  if (
    error != null &&
    typeof error === "object" &&
    "response" in error &&
    error.response != null &&
    typeof error.response === "object" &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return isRetryableStatus(error.response.status)
  }

  // Last resort: a wrapper that is not literally an `SdkException` (a test
  // double, a future wrapper class) but still nests the raw transport error.
  return isTransientTransportError(readOriginError(error))
}
