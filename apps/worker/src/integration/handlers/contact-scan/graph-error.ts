import { SdkException } from "@chatbotx.io/sdk"
import { isRetryable } from "../shared/http-retry"
import type { ContactScanErrorClassification } from "./adapter"

/**
 * Flat instance fields every Graph SDK exception carries —
 * `MessengerAPIException` (`@chatbotx.io/integration-messenger/exception`)
 * and `InstagramAPIException` (`@chatbotx.io/integration-instagram`'s and
 * `@chatbotx.io/integration-instagram-facebook`'s, both `extends
 * InstagramException`) all `extends SdkException`. Each package's own
 * `rescue()` already normalizes the raw Graph error body into these fields
 * at throw time — see `integrations/messenger/src/exception.ts`'s
 * `rescue`/`parseOriginError` — so `listConversations`/
 * `listInstagramConversations`/`listInstagramFacebookConversations` never
 * throw the raw, unwrapped shape (a ky `HTTPError`, `{ httpStatus,
 * errorBody }`, etc.); they throw this flat shape. A classifier that only
 * understands the raw shape (the bug this file fixes — see
 * `classifyMessengerError`'s prior implementation) silently falls through to
 * "unknown" for every real error.
 */
type GraphSdkErrorFields = {
  httpStatusCode?: number
  code?: number | string
  type?: string
}

type ErrorWithOriginError = { getOriginError?: () => unknown }

/**
 * Reads the flat fields off a thrown Graph SDK error. Prefers
 * `instanceof SdkException` (the real, common base class both channels'
 * exceptions share); falls back to duck-typing `{ httpStatusCode, code,
 * type }` for a same-shaped error that isn't literally an `SdkException`
 * instance (e.g. a test double, or a future wrapper class that hasn't
 * adopted the base class).
 */
const readGraphSdkErrorFields = (error: unknown): GraphSdkErrorFields => {
  if (error instanceof SdkException) {
    return {
      httpStatusCode: error.httpStatusCode,
      code: error.code,
      type: error.type,
    }
  }
  if (error !== null && typeof error === "object") {
    const { httpStatusCode, code, type } = error as GraphSdkErrorFields
    return { httpStatusCode, code, type }
  }
  return {}
}

const toNumericCode = (
  code: number | string | undefined,
): number | undefined => {
  if (typeof code === "number") {
    return code
  }
  if (code === undefined) {
    return
  }
  const parsed = Number(code)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Meta Graph API codes shared by Messenger + Instagram (one Graph API, two
 * channels) that mean an application-level rate limit was hit — Meta doesn't
 * always signal this via a 429 HTTP status. Union of
 * `integrations/messenger/src/lib/error-mapper.ts`'s and
 * `integrations/instagram/src/lib/error-mapper.ts`'s (byte-identical to
 * `integrations/instagram-facebook/.../error-mapper.ts`) `RATE_LIMITED_CODES`.
 * The two packages' canonical sets differ by one code (613, Instagram-only);
 * unioned here since both channels ride the same Graph API and the retry
 * decision is identical either way.
 */
const RATE_LIMITED_CODES = new Set([
  4, // API-level rate limit reached
  17, // User-level rate limit reached
  613, // Custom rate limit (instagram/instagram-facebook error-mapper.ts only)
])

/**
 * Codes that mean the stored access token is invalid/expired/revoked. Union
 * of both packages' `AUTH_FAILED_CODES` — Messenger's canonical set is a
 * strict superset of Instagram's (`{190}` only).
 */
const TOKEN_INVALID_CODES = new Set([
  102, // Invalid API session
  190, // Access token expired
  458, // App not installed / user not authenticated
  459, // User checkpoint required
  460, // Password changed
  463, // Access token expired
  464, // Unconfirmed user
  492, // Invalid session / user has no role on page
  467, // Invalid access token
])

/**
 * Codes that mean the app/token lacks the permission the call needs. Union
 * of both packages' `PERMISSION_DENIED_CODES`.
 */
const PERMISSION_DENIED_CODES = new Set([
  3, // Missing capability or permissions (messenger only)
  10, // Permission denied
  24, // Permission error — IG Content Publishing (instagram only)
  25, // IG account restricted/checkpointed (instagram only)
  341, // Application limit reached (messenger only)
  368, // Temporarily blocked for policy violations
])

/** Graph's dedicated "API Permission" status-code range. */
const PERMISSION_RANGE_MIN = 200
const PERMISSION_RANGE_MAX = 299

const RETRYABLE_HTTP_STATUS_MIN = 500

const isRetryableHttpStatus = (status: number | undefined): boolean =>
  typeof status === "number" &&
  (status === 429 || status >= RETRYABLE_HTTP_STATUS_MIN)

/**
 * Channel-agnostic classifier for the errors thrown by the Messenger and
 * Instagram Automatic Customer Scan adapters' `listPage` calls. Both
 * channels ride the same underlying Meta Graph API and both packages' own
 * `rescue()` wrap every failure into an `SdkException` subclass carrying the
 * real `httpStatusCode`/`code`/`type` as flat instance fields (see
 * `GraphSdkErrorFields` above) — this reads those fields directly instead of
 * re-parsing the error as if it were still the raw, unwrapped shape.
 *
 * Decision order (first match wins):
 *  1. retryable      — 429/5xx `httpStatusCode`, an application-level Graph
 *                       rate-limit code (`RATE_LIMITED_CODES`), or (safety
 *                       net for a raw, never-wrapped shape) `isRetryable`
 *                       against the error itself or its `getOriginError()`
 *  2. tokenInvalid    — `type === "OAuthException"`, or a token-invalidation
 *                       code (`TOKEN_INVALID_CODES`)
 *  3. graphPermission — a permission-denied code (`PERMISSION_DENIED_CODES`),
 *                       or Graph's 200-299 "API Permission" status range
 *  4. unknown         — anything else
 */
export const classifyGraphSdkError = (
  error: unknown,
): ContactScanErrorClassification => {
  const fields = readGraphSdkErrorFields(error)
  const code = toNumericCode(fields.code)
  const originError = (error as ErrorWithOriginError | null)?.getOriginError?.()

  if (
    isRetryableHttpStatus(fields.httpStatusCode) ||
    (code !== undefined && RATE_LIMITED_CODES.has(code)) ||
    isRetryable(error) ||
    isRetryable(originError)
  ) {
    return "retryable"
  }

  if (
    fields.type === "OAuthException" ||
    (code !== undefined && TOKEN_INVALID_CODES.has(code))
  ) {
    return "tokenInvalid"
  }

  if (
    code !== undefined &&
    (PERMISSION_DENIED_CODES.has(code) ||
      (code >= PERMISSION_RANGE_MIN && code <= PERMISSION_RANGE_MAX))
  ) {
    return "graphPermission"
  }

  return "unknown"
}
