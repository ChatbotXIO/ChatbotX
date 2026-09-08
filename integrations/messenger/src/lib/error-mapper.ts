import {
  ChannelError,
  ChannelErrorCategory,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import {
  type ChannelErrorSource,
  MessengerException,
  parseOriginError,
} from "../exception"

function extractApiFields(exc: MessengerException): ChannelErrorSource {
  return {
    message: exc.message,
    code: exc.code,
    subCode: exc.subCode ?? null,
    type: exc.type,
    httpStatusCode: exc.httpStatusCode,
  }
}

// === Facebook API base error code categorization ===

const AUTH_FAILED_CODES = new Set([
  102, // Invalid API session
  190, // Access token expired
  458, // App not installed / user not authenticated
  459, // User checkpoint required
  460, // Password changed
  463, // Access token expired
  464, // Unconfirmed user
  467, // Invalid access token
  492, // Invalid session / user has no role on page
])

const PERMISSION_DENIED_CODES = new Set([
  3, // Missing capability or permissions
  10, // Permission denied
  341, // Application limit reached
  368, // Temporarily blocked for policy violations
])

const RATE_LIMITED_CODES = new Set([
  4, // API rate limit reached
  17, // User API rate limit reached
])

const PAYLOAD_INVALID_CODES = new Set([
  506, // Duplicate post
  1_609_005, // Error scraping link preview
])

const NETWORK_ERROR_CODES = new Set([
  1, // Unknown API error
  2, // Service unavailable
])

// FB Send API: recipient cannot receive messages (blocked page / opted out / unreachable).
const USER_BLOCKED_CODES = new Set([
  551, // This person isn't available right now
])

// FB Send API: code 200 (permission) + subcode 1545041 = user opted out of messages.
const USER_BLOCKED_SUBCODES = new Set([1_545_041])

function categorize(
  code: number | undefined,
  subCode: number | string | undefined,
  type: string | undefined,
): ChannelErrorCategory {
  if (code === undefined) {
    return ChannelErrorCategory.UNKNOWN
  }

  if (AUTH_FAILED_CODES.has(code)) {
    return ChannelErrorCategory.AUTH_FAILED
  }

  if (RATE_LIMITED_CODES.has(code)) {
    return ChannelErrorCategory.RATE_LIMITED
  }

  if (USER_BLOCKED_CODES.has(code)) {
    return ChannelErrorCategory.USER_BLOCKED
  }

  if (
    code === 200 &&
    subCode !== undefined &&
    USER_BLOCKED_SUBCODES.has(Number(subCode))
  ) {
    return ChannelErrorCategory.USER_BLOCKED
  }

  // 200-299 = API Permission range
  if (PERMISSION_DENIED_CODES.has(code) || (code >= 200 && code <= 299)) {
    return ChannelErrorCategory.PERMISSION_DENIED
  }

  if (NETWORK_ERROR_CODES.has(code)) {
    return ChannelErrorCategory.NETWORK_ERROR
  }

  if (PAYLOAD_INVALID_CODES.has(code)) {
    return ChannelErrorCategory.PAYLOAD_INVALID
  }

  if (type === "OAuthException") {
    return ChannelErrorCategory.AUTH_FAILED
  }

  return ChannelErrorCategory.UNKNOWN
}

function defaultHttpStatus(category: ChannelErrorCategory): number {
  switch (category) {
    case ChannelErrorCategory.RATE_LIMITED:
      return 429
    case ChannelErrorCategory.AUTH_FAILED:
      return 401
    case ChannelErrorCategory.PERMISSION_DENIED:
    case ChannelErrorCategory.USER_BLOCKED:
      return 403
    case ChannelErrorCategory.NETWORK_ERROR:
      return 503
    default:
      return 400
  }
}

function mapApiFields(fields: ChannelErrorSource): ChannelError {
  const numCode = typeof fields.code === "number" ? fields.code : undefined
  const category = categorize(numCode, fields.subCode ?? undefined, fields.type)
  return new ChannelError(fields.message ?? UNKNOWN_ERROR.message, category, {
    code: fields.code ?? UNKNOWN_ERROR.code,
    httpStatusCode: fields.httpStatusCode ?? defaultHttpStatus(category),
    subCode: fields.subCode,
    type: fields.type,
  })
}

// === Revoked / invalidated access token detection ===
// FB Graph signals revoked tokens via OAuthException + code 190 + specific subcodes:
//   458 = app not installed / user not authenticated
//   460 = password changed
//   463 = access token expired
//   467 = invalid access token
const REVOKED_TOKEN_SUBCODES = new Set([458, 460, 463, 467])

export function isRevokedTokenError(error: unknown): boolean {
  if (!(error instanceof MessengerException)) {
    return false
  }

  const mappedError = mapToChannelError(error)

  return (
    mappedError.category === ChannelErrorCategory.AUTH_FAILED &&
    mappedError.code === 190 &&
    mappedError.subCode !== null &&
    REVOKED_TOKEN_SUBCODES.has(Number(mappedError.subCode))
  )
}

// === Disconnect-safe error detection ===
// `DELETE /{page-id}/subscribed_apps` (app access token) fails *permanently*
// when the page-side link is already gone; retrying can never succeed, so the
// local teardown must proceed. Transient failures (rate limits, 5xx, network)
// are deliberately excluded so the operator retries them instead of tearing
// down on a failure that would have succeeded a minute later.
//
// Sources: developers.facebook.com/docs/graph-api/guides/error-handling and
// developers.facebook.com/docs/graph-api/reference/page/subscribed_apps.

// Page (or page ID) no longer resolvable from the app's point of view.
const PAGE_GONE_CODES = new Set([
  803, // Some of the aliases you requested do not exist
])

// Code 100 is the generic "Invalid parameter"; only these variants mean "gone".
const PAGE_GONE_SUBCODES_FOR_CODE_100 = new Set([
  33, // Object does not exist / cannot be loaded due to missing permissions
])

// "(#100) App is not installed: <pageId>" — the page admin already removed the
// app. Meta emits this with no error_subcode, so the message is the only key.
const APP_NOT_INSTALLED_PATTERN = /app is not installed/i

// The app lost its standing on the page; only a reconnect can restore it, so
// the unsubscribe is knowingly abandoned: if Meta still holds a subscription
// it stays there, and the warn log at the call site is the audit trail. That
// trade is the point — the alternative is an integration the operator can
// never delete. Meta's transient policy blocks (341, 368) are deliberately
// NOT here: those clear on their own, so the operator should retry.
const PERMISSION_LOST_CODES = new Set([
  10, // Permission denied
  200, // Permissions error
  210, // User not visible
])

const INVALID_PARAMETER_CODE = 100

/**
 * True when the remote unsubscribe can never succeed by retrying, so the
 * caller should drop the local integration anyway. Covers a revoked page
 * token, an already-uninstalled app, a deleted/unreachable page, and lost
 * page permissions. Everything else (transient, unknown, non-Messenger)
 * returns false and must surface to the user.
 */
export function isDisconnectSafeError(error: unknown): boolean {
  if (!(error instanceof MessengerException)) {
    return false
  }

  if (isRevokedTokenError(error)) {
    return true
  }

  const code = typeof error.code === "number" ? error.code : undefined
  if (code === undefined) {
    return false
  }

  if (PAGE_GONE_CODES.has(code) || PERMISSION_LOST_CODES.has(code)) {
    return true
  }

  if (code !== INVALID_PARAMETER_CODE) {
    return false
  }

  const subCode =
    error.subCode === null || error.subCode === undefined
      ? undefined
      : Number(error.subCode)
  if (subCode !== undefined && PAGE_GONE_SUBCODES_FOR_CODE_100.has(subCode)) {
    return true
  }

  return APP_NOT_INSTALLED_PATTERN.test(error.message)
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof MessengerException) {
    return mapApiFields(extractApiFields(rawError))
  }

  return mapApiFields(parseOriginError(rawError))
}
