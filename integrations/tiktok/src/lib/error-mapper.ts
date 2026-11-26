import {
  ChannelError,
  ChannelErrorCategory,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import {
  type ChannelErrorSource,
  parseOriginError,
  TiktokAPIException,
  TiktokAuthException,
} from "../exception"

function extractApiFields(exc: TiktokAPIException): ChannelErrorSource {
  return {
    message: exc.message,
    code: exc.code,
    subCode: exc.subCode ?? null,
    type: exc.type,
    httpStatusCode: exc.httpStatusCode,
  }
}

const AUTH_FAILED_PATTERNS = [
  "access_token_invalid",
  "access_token_expired",
  "token_not_valid",
  "unauthorized",
  "invalid_token",
  "token revoked",
  "auth_failed",
]

const USER_BLOCKED_PATTERNS = [
  "user_blocked",
  "message_blocked",
  "user_restricted",
  "cannot send message",
  "dm_disabled",
]

const INVALID_RECIPIENT_PATTERNS = [
  "user_not_found",
  "open_id_not_found",
  "recipient_not_found",
  "invalid_open_id",
]

const PERMISSION_DENIED_PATTERNS = [
  "permission_denied",
  "scope_not_authorized",
  "insufficient_scope",
  "not_authorized",
]

const RATE_LIMITED_PATTERNS = [
  "rate_limit_exceeded",
  "too_many_requests",
  "quota_exceeded",
]

const NETWORK_ERROR_PATTERNS = ["etimedout", "econnreset", "webhook error"]

const PAYLOAD_INVALID_PATTERNS = [
  "message_too_long",
  "invalid_message",
  "bad_request",
  "parameter_invalid",
]

function matchesAny(description: string, patterns: string[]): boolean {
  const lower = description.toLowerCase()
  return patterns.some((p) => lower.includes(p.toLowerCase()))
}

function categorize(
  httpStatus: number,
  description: string,
): ChannelErrorCategory {
  if (matchesAny(description, AUTH_FAILED_PATTERNS)) {
    return ChannelErrorCategory.AUTH_FAILED
  }
  if (matchesAny(description, USER_BLOCKED_PATTERNS)) {
    return ChannelErrorCategory.USER_BLOCKED
  }
  if (matchesAny(description, INVALID_RECIPIENT_PATTERNS)) {
    return ChannelErrorCategory.INVALID_RECIPIENT
  }
  if (matchesAny(description, PERMISSION_DENIED_PATTERNS)) {
    return ChannelErrorCategory.PERMISSION_DENIED
  }
  if (matchesAny(description, RATE_LIMITED_PATTERNS)) {
    return ChannelErrorCategory.RATE_LIMITED
  }
  if (matchesAny(description, NETWORK_ERROR_PATTERNS)) {
    return ChannelErrorCategory.NETWORK_ERROR
  }
  if (matchesAny(description, PAYLOAD_INVALID_PATTERNS)) {
    return ChannelErrorCategory.PAYLOAD_INVALID
  }

  if (httpStatus === 401) {
    return ChannelErrorCategory.AUTH_FAILED
  }
  if (httpStatus === 403) {
    return ChannelErrorCategory.PERMISSION_DENIED
  }
  if (httpStatus === 404) {
    return ChannelErrorCategory.INVALID_RECIPIENT
  }
  if (httpStatus === 429) {
    return ChannelErrorCategory.RATE_LIMITED
  }
  if (httpStatus === 400) {
    return ChannelErrorCategory.PAYLOAD_INVALID
  }
  if (httpStatus >= 500) {
    return ChannelErrorCategory.NETWORK_ERROR
  }

  return ChannelErrorCategory.UNKNOWN
}

function mapTiktokStatus(fields: ChannelErrorSource): ChannelError {
  const description = (fields.message ?? "").toLowerCase()
  const category = categorize(fields.httpStatusCode, description)
  return new ChannelError(fields.message ?? UNKNOWN_ERROR.message, category, {
    code: fields.code ?? UNKNOWN_ERROR.code,
    httpStatusCode: fields.httpStatusCode,
  })
}

/**
 * Whether the error means the connection's credentials no longer work.
 *
 * Only consulted where a refresh has already been tried or is the failing
 * call itself (connection verify, the refresh paths), so a rejected access
 * token there is terminal. An ordinary expired token on a send never gets
 * here: the SDK refreshes and retries on the `TiktokAuthException` first.
 */
export function isRevokedTokenError(error: unknown): boolean {
  if (error instanceof TiktokAuthException) {
    return true
  }
  if (error instanceof TiktokAPIException) {
    const code = String(error.code ?? "").toLowerCase()
    const msg = (error.message ?? "").toLowerCase()
    return (
      matchesAny(code, AUTH_FAILED_PATTERNS) ||
      matchesAny(msg, AUTH_FAILED_PATTERNS) ||
      error.httpStatusCode === 401
    )
  }
  return false
}

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }

  if (rawError instanceof TiktokAuthException) {
    return new ChannelError(
      rawError.message,
      ChannelErrorCategory.AUTH_FAILED,
      {
        code: rawError.code,
        httpStatusCode: rawError.httpStatusCode,
      },
    )
  }

  if (rawError instanceof TiktokAPIException) {
    return mapTiktokStatus(extractApiFields(rawError))
  }

  return mapTiktokStatus(parseOriginError(rawError))
}
