import { SdkException } from "@chatbotx.io/sdk"
import { DrizzleQueryError } from "drizzle-orm"

/**
 * Drizzle stringifies the failing SQL and every bound parameter into
 * `error.message`. Persisting that verbatim puts schema names and row IDs in
 * front of end users, so any message carrying this marker is replaced wholesale
 * rather than trimmed — a partial redaction still leaks the table layout.
 */
const QUERY_DUMP_REGEX = /failed\s+query:/i
const MAX_PUBLIC_ERROR_LENGTH = 500
const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const AUTHORIZATION_CREDENTIAL_REGEX =
  /\bAuthorization\s*[:=]\s*(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi
const SENSITIVE_ASSIGNMENT_REGEX =
  /(["']?)(access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?token|id[_-]?token|client[_-]?id[_-]?token|password|secret|client[_-]?secret|consumer[_-]?secret|app[_-]?secret|private[_-]?key|api[_-]?key|authorization)\1(\s*[:=]\s*)(?:(["'])[^"'\r\n]*\4|[^,\s}&]+)/gi
const SENSITIVE_QUERY_REGEX =
  /([?&](?:access_token|refresh_token|auth_token|session_token|id_token|client_id_token|token|password|secret|client_secret|consumer_secret|app_secret|private_key|api_key|authorization)=)[^&\s]+/gi

/** The SDK's "we could not parse a code out of this" sentinel. */
const UNKNOWN_UPSTREAM_CODE = -1

const trimmedText = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim() : ""
  return text.length > 0 ? text : undefined
}

const sanitizePublicText = (value: string): string => {
  const withoutControlCharacters = Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? " " : character
  }).join("")
  const redacted = withoutControlCharacters
    .replace(AUTHORIZATION_CREDENTIAL_REGEX, "Authorization: [REDACTED]")
    .replace(BEARER_TOKEN_REGEX, "Bearer [REDACTED]")
    .replace(
      SENSITIVE_ASSIGNMENT_REGEX,
      (
        _match,
        keyQuote: string,
        key: string,
        separator: string,
        valueQuote: string | undefined,
      ) =>
        `${keyQuote}${key}${keyQuote}${separator}${
          valueQuote ? `${valueQuote}[REDACTED]${valueQuote}` : "[REDACTED]"
        }`,
    )
    .replace(SENSITIVE_QUERY_REGEX, "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
  return redacted.slice(0, MAX_PUBLIC_ERROR_LENGTH)
}

/**
 * Channel failures are the ones a workspace can actually act on — an expired
 * token, a rejected image, a rate limit — so their text is preserved instead of
 * being replaced by a generic sentence.
 *
 * The mapped `message` often only names the failing call ("WhatsApp API call
 * failed"); the sentence Meta writes for end users arrives as `error_user_msg`
 * and is parked on `originError`, so that one leads. The upstream code is
 * appended when it is missing from the text, because it is what makes a report
 * traceable against Meta's docs and logs.
 */
const channelErrorMessage = (error: unknown): string | undefined => {
  if (!(error instanceof SdkException)) {
    return
  }
  const origin = error.getOriginError() as
    | { userTitle?: unknown; userMessage?: unknown }
    | undefined
  const detail =
    trimmedText(origin?.userMessage) ?? trimmedText(origin?.userTitle)
  const base = trimmedText(error.message)
  const text = [base, detail === base ? undefined : detail]
    .filter(Boolean)
    .join(": ")
  if (!text) {
    return
  }
  const code = error.code
  const shouldAppendCode =
    (typeof code === "number" || typeof code === "string") &&
    code !== UNKNOWN_UPSTREAM_CODE &&
    !text.includes(String(code))
  return shouldAppendCode ? `${text} (code ${code})` : text
}

/**
 * Reduces a thrown value to something safe to persist and show to a user.
 *
 * Infrastructure failures collapse to `fallback`; everything else keeps its
 * message, which is what makes an error actionable (Meta's "(#100) The
 * parameter item_type is required" has to survive). Always log the original
 * error separately — this function is for the UI, not for diagnostics.
 */
export const toPublicErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (error instanceof DrizzleQueryError) {
    return fallback
  }
  const message =
    channelErrorMessage(error) ??
    (error instanceof ChatbotXException ? error.message : undefined)
  if (!message || QUERY_DUMP_REGEX.test(message)) {
    return fallback
  }
  return sanitizePublicText(message) || fallback
}

export class ChatbotXException extends Error {
  code = "systemError"
  httpStatusCode = 400

  constructor(message: string, code?: string, httpStatusCode?: number) {
    super(message)

    this.name = this.constructor.name
    if (code) {
      this.code = code
    }
    if (httpStatusCode) {
      this.httpStatusCode = httpStatusCode
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ChatbotXException)
    }
  }
}

export const notFoundException = (message: string) =>
  new ChatbotXException(message, "notFound", 404)

export const channelDuplicatedException = () =>
  new ChatbotXException(
    "This account is already connected to another workspace.",
    "channelDuplicated",
  )

export const channelLimitReachedException = () =>
  new ChatbotXException(
    "Channel limit reached for this plan",
    "channelLimitReached",
  )

export const workspaceLimitReachedException = () =>
  new ChatbotXException(
    "Workspace limit reached for this plan",
    "workspaceLimitReached",
  )
