import {
  ChannelError,
  ChannelErrorCategory,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import {
  type ChannelErrorSource,
  parseOriginError,
  ZaloException,
} from "./exception"

function extractApiFields(exc: ZaloException): ChannelErrorSource {
  return {
    message: exc.message,
    code: exc.code,
    subCode: exc.subCode ?? null,
    type: exc.type,
    httpStatusCode: exc.httpStatusCode,
  }
}

// === Zalo ZNS / Template API error code categorization ===

const AUTH_FAILED_CODES = new Set([
  -101, // Invalid application
  -103, // Application not activated
  -104, // Invalid app secret
  -124, // Invalid access token
  -1241, // Invalid appsecret_proof
  -148, // Missing journey token
  -149, // Invalid journey token
  -1491, // Invalid journey token type
  -150, // Journey token expired
])

const PERMISSION_DENIED_CODES = new Set([
  -117, // OA/App has no permission to use template
  -120, // OA has no permission for this feature
  -1202, // OA has no permission to use media resources
  -135, // OA cannot send messages via phone number
  -1351, // OA blocked due to violation detection
  -136, // ZBS Account connection required
  -138, // App has no permission for this feature
  -1381, // Extension has no permission to use OA's ZBS account
  -145, // OA not allowed to send this template type
])

const QUOTA_EXCEEDED_CODES = new Set([
  -115, // Out of quota / insufficient balance
  -126, // Development mode quota exceeded
  -144, // Daily phone message quota exceeded
  -1441, // Monthly promotion quota exceeded
  -147, // Template daily quota exceeded
  -1471, // Monthly promotion limit reached for this user
  -1472, // Daily promotion limit reached for this user
  -160, // Template edit/create/upload daily quota exceeded
])

const USER_BLOCKED_CODES = new Set([
  -139, // User refused this template type
  -140, // User not eligible under delivery policy
  -141, // User refused phone messages from OA
  -216, // User blocked OA
])

const INVALID_RECIPIENT_CODES = new Set([
  -108, // Invalid phone number
  -118, // Zalo account does not exist or disabled
])

const PAYLOAD_INVALID_CODES = new Set([
  -107, // Invalid message ID
  -109, // Invalid template ID
  -1091, // Cannot edit this template type
  -111, // Template data empty
  -112, // Template data type undefined
  -1121, // Parameter exceeds max length
  -1122, // Missing template parameter
  -1123, // QR code generation failed
  -1124, // Invalid parameter format
  -113, // Invalid button
  -1131, // Invalid button/link format
  -1132, // Missing required button
  -116, // Invalid text content
  -121, // Template body empty
  -122, // Invalid JSON body format
  -125, // Invalid OA ID
  -127, // Test template only allowed for admin
  -130, // Character limit exceeded
  -131, // Template not approved
  -132, // Invalid parameter
  -142, // RSA key does not exist
  -143, // RSA key already exists
  -151, // Not an E2EE template
  -152, // Failed to get E2EE key
  -153, // Invalid request data
  -158, // Uploaded file too large
  -159, // Invalid uploaded file format
  -161, // Invalid sending_mode value
  -162, // This template type is not supported on this endpoint
  -249, // Template does not support UID sending
])

const NETWORK_ERROR_CODES = new Set([
  -137, // ZBS payment failure
])

function categorize(code: number | undefined): ChannelErrorCategory {
  if (code === undefined) {
    return ChannelErrorCategory.UNKNOWN
  }

  if (AUTH_FAILED_CODES.has(code)) {
    return ChannelErrorCategory.AUTH_FAILED
  }

  if (PERMISSION_DENIED_CODES.has(code)) {
    return ChannelErrorCategory.PERMISSION_DENIED
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

  if (PAYLOAD_INVALID_CODES.has(code)) {
    return ChannelErrorCategory.PAYLOAD_INVALID
  }

  if (NETWORK_ERROR_CODES.has(code)) {
    return ChannelErrorCategory.NETWORK_ERROR
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

function mapZaloCode(fields: ChannelErrorSource): ChannelError {
  const numCode = typeof fields.code === "number" ? fields.code : undefined
  const category = categorize(numCode)
  return new ChannelError(fields.message ?? UNKNOWN_ERROR.message, category, {
    code: fields.code ?? UNKNOWN_ERROR.code,
    httpStatusCode: fields.httpStatusCode ?? defaultHttpStatus(category),
    subCode: fields.subCode,
    type: fields.type,
  })
}

// === Revoked / invalidated access token detection ===
// Zalo OA does not expose a deterministic revoked-token error code — invalid
// access tokens raise code -124 (AUTH_FAILED). Reconnect is driven by OA admin.
// Always returns false.
export function isRevokedTokenError(_error: unknown): boolean {
  return false
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof ZaloException) {
    return mapZaloCode(extractApiFields(rawError))
  }

  return mapZaloCode(parseOriginError(rawError))
}
