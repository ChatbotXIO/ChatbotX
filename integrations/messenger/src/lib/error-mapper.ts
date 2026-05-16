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

function categorize(
  code: number | undefined,
  type: string | undefined,
): ChannelErrorCategory {
  if (type === "OAuthException") {
    return ChannelErrorCategory.AUTH_FAILED
  }

  if (code === undefined) {
    return ChannelErrorCategory.UNKNOWN
  }

  if (AUTH_FAILED_CODES.has(code)) {
    return ChannelErrorCategory.AUTH_FAILED
  }

  if (RATE_LIMITED_CODES.has(code)) {
    return ChannelErrorCategory.RATE_LIMITED
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
  const category = categorize(numCode, fields.type)
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

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof MessengerException) {
    return mapApiFields(extractApiFields(rawError))
  }

  return mapApiFields(parseOriginError(rawError))
}
