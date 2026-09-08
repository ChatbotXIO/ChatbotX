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
// A provider or transport message may echo the request URL, which carries
// account ids and query parameters. Opt-in only (`redactUrls`): a persisted
// flow/webhook/import error names the endpoint the operator configured
// themselves, and stripping it there would take away the one detail that
// makes the failure diagnosable.
const URL_REGEX = /https?:\/\/\S+/gi
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

type SanitizeOptions = {
  maxLength?: number
  /**
   * Replace every absolute URL with `[url]`. On for the connect row, whose
   * `detail` comes straight from a provider response aimed at an OAuth
   * endpoint we own; off everywhere else, where the URL in the message is the
   * operator's own and is the point of the message.
   */
  redactUrls?: boolean
}

/**
 * Redacts credentials/tokens, flattens control characters and whitespace, and
 * caps the result. Exported so every surface that shows provider text to a
 * user — persisted error messages here, the connect-row `detail` in
 * `./inbox/connect-outcome.ts` — runs it through the same redactor instead of
 * hand-rolling a second, weaker one.
 */
export const sanitizePublicText = (
  value: string,
  options: SanitizeOptions = {},
): string => {
  const { maxLength = MAX_PUBLIC_ERROR_LENGTH, redactUrls = false } = options
  const withoutControlCharacters = Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? " " : character
  }).join("")
  const withoutUrls = redactUrls
    ? withoutControlCharacters.replace(URL_REGEX, "[url]")
    : withoutControlCharacters
  const redacted = withoutUrls
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
  return redacted.slice(0, maxLength)
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
  // Channel mappers that compose Meta's user sentence into `message` still park
  // a copy on `originError` for its structured fields, so appending it here
  // unconditionally would print that sentence twice.
  const extra =
    detail !== undefined && base?.includes(detail) ? undefined : detail
  const text = [base, extra].filter(Boolean).join(": ")
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
  field?: string
  code = "systemError"
  httpStatusCode = 400
  /**
   * Structured params for a caller that wants to re-localize `message`
   * (e.g. `t(message, data)`) instead of showing the raw English string —
   * optional, so every existing throw site (plain-message `message`) stays
   * valid.
   */
  data?: Record<string, string | number>

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

export const validationException = (
  field: string,
  message: string,
  data?: Record<string, string | number>,
) => {
  const error = new ChatbotXException(message, "validation", 422)
  error.field = field
  error.data = data
  return error
}

export const channelDuplicatedException = () =>
  new ChatbotXException(
    "This account is already connected to another workspace.",
    "channelDuplicated",
  )

/**
 * The workspace's platform owner has no configured credential (Meta app,
 * WhatsApp Business app, etc.) for the channel being connected. Kept
 * distinct from a generic `ChatbotXException` so `toConnectSessionError`
 * (`packages/business/src/inbox/connect-outcome.ts`) can map it to the
 * `credentialMissing` session-error code without every call site having to
 * remember the exact code string.
 */
export const credentialMissingException = (message: string) =>
  new ChatbotXException(message, "credentialMissing")

/**
 * A connect flow's session (the pending-auth cookie for Messenger/Instagram,
 * or a WhatsApp signup session) is missing, expired, or otherwise unusable —
 * a condition that makes every remaining request in a multi-select batch
 * pointless, not just the one item. See
 * `packages/business/src/inbox/connect-outcome.ts` for how this is turned
 * into a typed `sessionError` result instead of a thrown/rendered error.
 *
 * `code` defaults to "connectSessionExpired" (Messenger/Instagram's
 * pending-auth cookie); pass "signupSessionExpired" for WhatsApp's
 * per-number signup-session claim, which is tracked as a distinct exception
 * code even though both map to the same `sessionExpired` client code.
 */
export const connectSessionExpiredException = (
  message: string,
  code:
    | "connectSessionExpired"
    | "signupSessionExpired" = "connectSessionExpired",
) => new ChatbotXException(message, code)

/**
 * The acting user resolved a workspace id that they are not a member of.
 * Kept distinct from the generic `notFoundException` so a connect flow can
 * map it to a specific, machine-readable session error instead of a vague
 * "not found".
 */
export const notWorkspaceMemberException = () =>
  new ChatbotXException(
    "You are not a member of this workspace.",
    "notWorkspaceMember",
    403,
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
