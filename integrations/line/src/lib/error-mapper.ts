import {
  AuthException,
  ChannelError,
  ChannelErrorCategory,
  SdkException,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import { type ChannelErrorSource, parseOriginError } from "../exception"

const MONTHLY_LIMIT_PATTERN = "monthly limit"
const NOT_FRIEND_PATTERNS = [
  "hasn't added the line official account as a friend",
  "has blocked the line official account",
  "not a friend",
]
const INVALID_RECIPIENT_PATTERNS = [
  "failed to send messages",
  "invalid user",
  "invalid reply token",
]

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p))
}

function categorize(status: number, message: string): ChannelErrorCategory {
  if (status === 429) {
    return message.includes(MONTHLY_LIMIT_PATTERN)
      ? ChannelErrorCategory.QUOTA_EXCEEDED
      : ChannelErrorCategory.RATE_LIMITED
  }
  if (status === 401) {
    return ChannelErrorCategory.AUTH_FAILED
  }
  if (status === 403) {
    return ChannelErrorCategory.PERMISSION_DENIED
  }
  if (status === 400 || status === 404 || status === 409) {
    if (matchesAny(message, NOT_FRIEND_PATTERNS)) {
      return ChannelErrorCategory.USER_BLOCKED
    }
    if (matchesAny(message, INVALID_RECIPIENT_PATTERNS)) {
      return ChannelErrorCategory.INVALID_RECIPIENT
    }
    return ChannelErrorCategory.PAYLOAD_INVALID
  }
  if (status >= 500) {
    return ChannelErrorCategory.NETWORK_ERROR
  }
  return ChannelErrorCategory.UNKNOWN
}

function toChannelError(fields: ChannelErrorSource): ChannelError {
  const message = (fields.message ?? "").toLowerCase()
  return new ChannelError(
    fields.message ?? UNKNOWN_ERROR.message,
    categorize(fields.httpStatusCode, message),
    {
      code: fields.code ?? UNKNOWN_ERROR.code,
      httpStatusCode: fields.httpStatusCode,
    },
  )
}

const NETWORK_ERROR_NAMES = new Set(["TypeError", "TimeoutError", "FetchError"])

export function mapToChannelError(rawError: unknown): ChannelError {
  if (rawError instanceof ChannelError) {
    return rawError
  }
  if (rawError instanceof SdkException) {
    return toChannelError({
      message: rawError.message,
      code: rawError.code,
      httpStatusCode: rawError.httpStatusCode,
    })
  }
  if (rawError instanceof Error && NETWORK_ERROR_NAMES.has(rawError.name)) {
    return new ChannelError(
      rawError.message,
      ChannelErrorCategory.NETWORK_ERROR,
    )
  }
  return toChannelError(parseOriginError(rawError))
}

/**
 * Like `mapToChannelError`, but lets an `AuthException` through unchanged: the
 * SDK refreshes the token and retries only when it sees one.
 */
export function toChannelErrorUnlessAuth(error: unknown): unknown {
  return error instanceof AuthException ? error : mapToChannelError(error)
}
