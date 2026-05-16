import {
  ChannelError,
  ChannelErrorCategory,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import {
  type ChannelErrorSource,
  parseOriginError,
  WhatsappException,
} from "../exception"

function extractApiFields(exc: WhatsappException): ChannelErrorSource {
  return {
    message: exc.message,
    code: exc.code,
    subCode: exc.subCode ?? null,
    type: exc.type,
    httpStatusCode: exc.httpStatusCode,
  }
}

// === WhatsApp / Meta Cloud API error code categorization ===

const AUTH_FAILED_CODES = new Set([
  0, // AuthException
  190, // Access token expired/invalid
  133_005, // Wrong 2FA PIN
  133_008, // Too many PIN attempts
  133_009, // PIN entered too quickly
])

const PERMISSION_DENIED_CODES = new Set([
  3, // Capability disabled
  10, // Permission denied
  131_005, // Access denied
  368, // Policy violation block
  130_497, // Country restriction
  131_031, // WABA locked/restricted
  131_042, // Billing/eligibility issue
  131_057, // WABA maintenance mode
  131_064, // Restricted due to template violations
  133_000, // Deregistration incomplete
  133_006, // Phone verification required
  133_010, // Phone not registered
  133_015, // Wait before re-registering
])

const RATE_LIMITED_CODES = new Set([
  4, // App API rate limit
  80_007, // WABA rate limit
  130_429, // Throughput limit reached
  131_048, // Spam rate limit
  131_056, // Sender-recipient pair rate limit
  133_016, // Register/deregister attempts exceeded
])

const QUOTA_EXCEEDED_CODES = new Set([
  131_047, // 24h customer care window expired
])

const USER_BLOCKED_CODES = new Set([
  130_403, // Business blocked user
  131_026, // Message undeliverable
  131_049, // Meta blocked delivery
  131_050, // User opted out of marketing
])

const INVALID_RECIPIENT_CODES = new Set([
  33, // Invalid/deleted phone number
  131_021, // Sender equals recipient
  130_472, // User in experiment / excluded
])

const PAYLOAD_INVALID_CODES = new Set([
  100, // Generic invalid parameter
  131_008, // Missing required parameter
  131_009, // Invalid parameter value
  131_037, // Display name approval required
  131_052, // Media download failed
  131_053, // Media upload failed
  131_055, // Only marketing templates supported
  132_000, // Template variable count mismatch
  132_001, // Template does not exist / not approved
  132_005, // Template translated text too long
  132_007, // Template policy violation
  132_012, // Template parameter format mismatch
  132_015, // Template paused
  132_016, // Template permanently disabled
  132_018, // Template validation error
  132_068, // Flow blocked
  132_069, // Flow throttled
  134_100, // Only marketing messages allowed
  134_101, // Template still syncing
  134_102, // Template unavailable / onboarding issue
  135_000, // Generic request error
])

const NETWORK_ERROR_CODES = new Set([
  1, // Unknown API/server error
  2, // Temporary service issue
  131_000, // Unknown internal error
  131_016, // Service unavailable
  133_004, // Server temporarily unavailable
])

function categorize(
  code: number | undefined,
  type: string | undefined,
): ChannelErrorCategory {
  if (code === undefined) {
    return type === "OAuthException"
      ? ChannelErrorCategory.AUTH_FAILED
      : ChannelErrorCategory.UNKNOWN
  }

  if (AUTH_FAILED_CODES.has(code) || type === "OAuthException") {
    return ChannelErrorCategory.AUTH_FAILED
  }

  if (RATE_LIMITED_CODES.has(code)) {
    return ChannelErrorCategory.RATE_LIMITED
  }

  if (QUOTA_EXCEEDED_CODES.has(code)) {
    return ChannelErrorCategory.QUOTA_EXCEEDED
  }

  if (USER_BLOCKED_CODES.has(code)) {
    return ChannelErrorCategory.USER_BLOCKED
  }

  if (INVALID_RECIPIENT_CODES.has(code)) {
    return ChannelErrorCategory.INVALID_RECIPIENT
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

  return new ChannelError(
    fields.message ?? "WhatsApp API call failed",
    category,
    {
      code: fields.code ?? UNKNOWN_ERROR.code,
      httpStatusCode: fields.httpStatusCode ?? defaultHttpStatus(category),
      subCode: fields.subCode,
      type: fields.type,
    },
  )
}

// === Revoked / invalidated access token detection ===
// WA Cloud API signals revoked permission via GraphMethodException + code 100 + subcode 33
// (system user / phone number disconnected, or permission revoked).
export function isRevokedTokenError(error: unknown): boolean {
  if (!(error instanceof WhatsappException)) {
    return false
  }

  const mappedError = mapToChannelError(error)

  return (
    mappedError.type === "GraphMethodException" &&
    mappedError.code === 100 &&
    Number(mappedError.subCode) === 33
  )
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof WhatsappException) {
    return mapApiFields(extractApiFields(rawError))
  }

  const error = parseOriginError(rawError)

  return mapApiFields(error)
}
