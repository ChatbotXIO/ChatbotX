import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { HTTPError } from "ky"
import { ThreadsException } from "../exception"
import { sanitizeSensitiveText } from "./error-sanitizer"

const AUTH_FAILED_CODES = new Set([102, 190, 458, 459, 460, 463, 464, 467])
const PERMISSION_DENIED_CODES = new Set([3, 10, 200, 341, 368])
const RATE_LIMITED_CODES = new Set([4, 17, 32, 613])
const QUOTA_EXCEEDED_CODES = new Set([2_207_042])
const NETWORK_ERROR_CODES = new Set([1, 2, 5])
const PAYLOAD_INVALID_CODES = new Set([33, 100, 506])

function categorize(error: ThreadsException): ChannelErrorCategory {
  const code = typeof error.code === "number" ? error.code : undefined

  if (code !== undefined) {
    if (AUTH_FAILED_CODES.has(code)) {
      return ChannelErrorCategory.AUTH_FAILED
    }

    if (RATE_LIMITED_CODES.has(code)) {
      return ChannelErrorCategory.RATE_LIMITED
    }

    if (QUOTA_EXCEEDED_CODES.has(code)) {
      return ChannelErrorCategory.QUOTA_EXCEEDED
    }

    if (PERMISSION_DENIED_CODES.has(code) || (code >= 200 && code <= 299)) {
      return ChannelErrorCategory.PERMISSION_DENIED
    }

    if (NETWORK_ERROR_CODES.has(code)) {
      return ChannelErrorCategory.NETWORK_ERROR
    }

    if (PAYLOAD_INVALID_CODES.has(code)) {
      return ChannelErrorCategory.PAYLOAD_INVALID
    }
  }

  if (error.type === "OAuthException" || error.httpStatusCode === 401) {
    return ChannelErrorCategory.AUTH_FAILED
  }

  if (error.httpStatusCode === 429) {
    return ChannelErrorCategory.RATE_LIMITED
  }

  if (error.httpStatusCode !== undefined && error.httpStatusCode >= 500) {
    return ChannelErrorCategory.NETWORK_ERROR
  }

  if (
    error.message.includes("did not finish within") ||
    error.message.includes("network") ||
    error.originError instanceof HTTPError
  ) {
    return ChannelErrorCategory.NETWORK_ERROR
  }

  return ChannelErrorCategory.UNKNOWN
}

function defaultHttpStatus(category: ChannelErrorCategory): number {
  switch (category) {
    case ChannelErrorCategory.AUTH_FAILED:
      return 401
    case ChannelErrorCategory.PERMISSION_DENIED:
      return 403
    case ChannelErrorCategory.RATE_LIMITED:
      return 429
    case ChannelErrorCategory.QUOTA_EXCEEDED:
      return 429
    case ChannelErrorCategory.NETWORK_ERROR:
      return 503
    default:
      return 400
  }
}

export function mapToChannelError(error: unknown): ChannelError {
  if (error instanceof ChannelError) {
    return error
  }

  if (error instanceof ThreadsException) {
    const category = categorize(error)
    return new ChannelError(error.message, category, {
      code: error.code ?? "channel_error",
      httpStatusCode: error.httpStatusCode ?? defaultHttpStatus(category),
      subCode: error.subCode,
      type: error.type,
    })
  }

  const message = sanitizeSensitiveText(
    error instanceof Error ? error.message : String(error),
  )
  return new ChannelError(message, ChannelErrorCategory.UNKNOWN, {
    code: "channel_error",
  })
}

export function isRevokedTokenError(error: unknown): boolean {
  if (!(error instanceof ThreadsException)) {
    return false
  }

  return (
    categorize(error) === ChannelErrorCategory.AUTH_FAILED &&
    error.code === 190 &&
    error.subCode !== undefined &&
    error.subCode !== null &&
    new Set([458, 460, 463, 467]).has(Number(error.subCode))
  )
}
