import {
  ChannelError,
  ChannelErrorCategory,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import {
  type ChannelErrorSource,
  InstagramException,
  parseOriginError,
} from "../exception"

function extractApiFields(exc: InstagramException): ChannelErrorSource {
  return {
    message: exc.message,
    code: exc.code,
    subCode: exc.subCode ?? null,
    type: exc.type,
    httpStatusCode: exc.httpStatusCode,
  }
}

// === Instagram Graph API + Direct messaging error categorization ===
// Combines FB Graph base codes (Direct messaging) with IG Content Publishing
// codes (per developers.facebook.com docs).

const AUTH_FAILED_CODES = new Set([
  190, // Access token expired (FB Graph)
])

const PERMISSION_DENIED_CODES = new Set([
  10, // Permission denied (FB Graph)
  24, // Permission error (IG Content Publishing)
  25, // IG account restricted/checkpointed
  368, // Temporarily blocked for policy violations
])

const RATE_LIMITED_CODES = new Set([
  4, // App-level rate limit (FB Graph + IG spam)
  17, // User-level rate limit
  613, // Custom rate (FB Graph)
])

const QUOTA_EXCEEDED_CODES = new Set([
  9, // IG daily publishing limit
])

const USER_BLOCKED_CODES = new Set([
  551, // User blocked / account unavailable
])

const PAYLOAD_INVALID_CODES = new Set([
  1, // IG thumbnail offset invalid
  100, // Generic bad parameter (FB + IG)
  352, // Unsupported video format
  9004, // Media URI fetch failed
  9007, // Media not ready for publishing
  36_000, // Image size too large
  36_001, // Unsupported image format
  36_003, // Invalid aspect ratio
  36_004, // Caption too long
])

const NETWORK_ERROR_CODES = new Set([
  -1, // IG server / upload error (transient)
  -2, // Media download timeout / expired
])

// Subcode-specific overrides take precedence over code-based mapping
const SUBCODE_OVERRIDES = new Map<number, ChannelErrorCategory>([
  // 24h messaging window
  [2_018_028, ChannelErrorCategory.QUOTA_EXCEEDED],
  // Invalid IGID / no matching user
  [2_018_001, ChannelErrorCategory.INVALID_RECIPIENT],
  // User opted out of messages (FB Send API subcode under code 200)
  [1_545_041, ChannelErrorCategory.USER_BLOCKED],
  // IG Content Publishing subcodes
  [2_207_042, ChannelErrorCategory.QUOTA_EXCEEDED], // Daily publishing limit
  [2_207_050, ChannelErrorCategory.PERMISSION_DENIED], // Account restricted
  [2_207_051, ChannelErrorCategory.RATE_LIMITED], // Spam restriction
  [2_207_020, ChannelErrorCategory.PAYLOAD_INVALID], // Media expired
  [2_207_052, ChannelErrorCategory.PAYLOAD_INVALID], // Media URI fetch failed
])

function categorize(
  code: number | undefined,
  subcode: number | undefined,
  type: string | undefined,
): ChannelErrorCategory {
  if (subcode !== undefined && SUBCODE_OVERRIDES.has(subcode)) {
    const override = SUBCODE_OVERRIDES.get(subcode)
    if (override !== undefined) {
      return override
    }
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

  if (QUOTA_EXCEEDED_CODES.has(code)) {
    return ChannelErrorCategory.QUOTA_EXCEEDED
  }

  if (USER_BLOCKED_CODES.has(code)) {
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
  const numSubCode =
    typeof fields.subCode === "number" ? fields.subCode : undefined
  const category = categorize(numCode, numSubCode, fields.type)
  return new ChannelError(fields.message ?? UNKNOWN_ERROR.message, category, {
    code: fields.code ?? UNKNOWN_ERROR.code,
    httpStatusCode: fields.httpStatusCode ?? defaultHttpStatus(category),
    subCode: fields.subCode,
    type: fields.type,
  })
}

// === Revoked / invalidated access token detection ===
// Instagram messaging does not surface a deterministic revoked-token signal —
// reconnect flow is driven by upstream FB Page disconnect. Always returns false.
export function isRevokedTokenError(_error: unknown): boolean {
  return false
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof InstagramException) {
    return mapApiFields(extractApiFields(rawError))
  }

  return mapApiFields(parseOriginError(rawError))
}
