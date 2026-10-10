import { AuthException, SdkException } from "@chatbotx.io/sdk"
import { z } from "zod"
import { redactSecrets } from "./lib/redact"

const HTTP_UNAUTHORIZED = 401
const HTTP_REQUEST_TIMEOUT = 408
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR = 500
const FALLBACK_HTTP_STATUS = 400
const NOT_ADS_USER_REASON = "NOT_ADS_USER"

// Tolerant by design: a malformed body must degrade to "no detail", never throw
// and bypass HTTP classification. `.catch` drops any wrongly typed field.
const optionalOf = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined)

const errorItemSchema = z.object({
  message: optionalOf(z.string()),
  errorCode: optionalOf(z.record(z.string(), z.unknown())),
})

const fieldViolationSchema = z.object({
  field: optionalOf(z.string()),
  description: optionalOf(z.string()),
  reason: optionalOf(z.string()),
})

const errorDetailSchema = z.object({
  fieldViolations: z
    .array(fieldViolationSchema.catch({}))
    .optional()
    .catch(undefined),
  reason: optionalOf(z.string()),
  requestId: optionalOf(z.string()),
  errors: z
    .array(errorItemSchema.catch({ message: undefined, errorCode: undefined }))
    .optional()
    .catch(undefined),
})

const errorBodySchema = z.object({
  error: z
    .object({
      status: optionalOf(z.string()),
      message: optionalOf(z.string()),
      details: z
        .array(
          errorDetailSchema.catch({
            reason: undefined,
            requestId: undefined,
            errors: undefined,
            fieldViolations: undefined,
          }),
        )
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
})

type GoogleErrorDetail = z.infer<typeof errorDetailSchema>

type KyHttpErrorShape = {
  response: { status: number }
  data?: unknown
}

export type GoogleAdsErrorSource = {
  httpStatusCode: number
  apiStatus?: string
  reason?: string
  /** The `errorCode` family the reason came from (e.g. `authorizationError`), when Google named one. */
  reasonCategory?: string
  requestId?: string
  message?: string
  /** Overrides the status-derived retryability (e.g. an unreadable 2xx body is terminal). */
  retryable?: boolean
  /** A bounded, redacted preview of an error body we could not read; for server logs only, never persisted. */
  responseSnippet?: string
  /** Per-error messages from `GoogleAdsFailure.errors` and bounded `BadRequest.fieldViolations`. */
  details: string[]
}

/**
 * Bounds on the violations copied into an error: they reach the UI and the
 * event row. The per-violation cap is only a memory guard — the real length
 * limit is applied by `sanitizeGoogleAdsError` AFTER the request secrets are
 * redacted, so a truncation can never leave a fragment of a click id behind.
 */
const MAX_FIELD_VIOLATIONS = 5
const MAX_FIELD_VIOLATION_LENGTH = 4000

/** `field: description (reason)`, whichever parts exist. */
const describeViolation = (
  violation: z.infer<typeof fieldViolationSchema>,
): string | undefined => {
  const base = [violation.field, violation.description]
    .filter(Boolean)
    .join(": ")
  const text = violation.reason ? `${base} (${violation.reason})`.trim() : base
  return text ? text.slice(0, MAX_FIELD_VIOLATION_LENGTH) : undefined
}

const collectFieldViolations = (details: GoogleErrorDetail[]): string[] =>
  details
    .flatMap((detail) => detail.fieldViolations ?? [])
    .flatMap((violation) => describeViolation(violation) ?? [])
    .slice(0, MAX_FIELD_VIOLATIONS)

const MAX_BODY_PREVIEW = 300

/** What Google sent when we could not read it, redacted and bounded for the server log. */
const previewBody = (data: unknown): string | undefined => {
  if (data === undefined || data === null || data === "") {
    return "(empty body)"
  }
  const text = typeof data === "string" ? data : JSON.stringify(data)
  return text ? redactSecrets(text).slice(0, MAX_BODY_PREVIEW) : undefined
}

/**
 * Unary endpoints answer `{error}`; streaming ones (`searchStream`) wrap the
 * same error in an array, `[{error}]`. Use the first element carrying `error`.
 */
const unwrapErrorBody = (data: unknown): unknown => {
  if (!Array.isArray(data)) {
    return data
  }
  return data.find(
    (item) => typeof item === "object" && item !== null && "error" in item,
  )
}

const asObject = <T>(value: unknown): T | undefined =>
  typeof value === "object" && value !== null ? (value as T) : undefined

const isKyHttpError = (value: unknown): value is KyHttpErrorShape =>
  typeof asObject<{ response?: { status?: unknown } }>(value)?.response
    ?.status === "number"

export const isRetryableGoogleAdsStatus = (status: number): boolean =>
  status === HTTP_REQUEST_TIMEOUT ||
  status === HTTP_TOO_MANY_REQUESTS ||
  status >= HTTP_SERVER_ERROR

type FoundReason = { reason: string; category?: string }

/** `google.rpc.ErrorInfo.reason`, else the first Google Ads `errorCode` enum value and its family. */
const findReasonEntry = (
  details: GoogleErrorDetail[],
): FoundReason | undefined => {
  const info = details.find((detail) => detail.reason)?.reason
  if (info) {
    return { reason: info }
  }
  for (const item of details.flatMap((detail) => detail.errors ?? [])) {
    for (const [category, value] of Object.entries(item.errorCode ?? {})) {
      if (typeof value === "string") {
        return { reason: value, category }
      }
    }
  }
  return
}

export const parseGoogleAdsOriginError = (
  originError: unknown,
): GoogleAdsErrorSource => {
  if (!isKyHttpError(originError)) {
    return {
      httpStatusCode: FALLBACK_HTTP_STATUS,
      message: originError instanceof Error ? originError.message : undefined,
      details: [],
    }
  }
  const error = errorBodySchema.safeParse(unwrapErrorBody(originError.data))
    .data?.error
  const details = error?.details ?? []
  const found = findReasonEntry(details)
  const understood = Boolean(error?.message || found)
  return {
    responseSnippet: understood ? undefined : previewBody(originError.data),
    httpStatusCode: originError.response.status,
    apiStatus: error?.status,
    reason: found?.reason,
    reasonCategory: found?.category,
    requestId: details.find((detail) => detail.requestId)?.requestId,
    message: error?.message,
    details: [
      ...details.flatMap((detail) =>
        (detail.errors ?? []).flatMap((item) => item.message ?? []),
      ),
      ...collectFieldViolations(details),
    ],
  }
}

export class GoogleAdsException extends SdkException {
  readonly retryable: boolean
  readonly apiStatus?: string
  readonly reason?: string
  readonly reasonCategory?: string
  readonly requestId?: string
  /** For server logs only (see {@link GoogleAdsErrorSource.responseSnippet}). */
  readonly responseSnippet?: string
  readonly details: string[]

  // No origin error is attached on purpose: the raw HTTP error still carries
  // the request body (click ids), and loggers walk nested errors.
  constructor(source: GoogleAdsErrorSource) {
    super(
      [source.message, ...source.details].filter(Boolean).join(" | ") ||
        "Google Ads API call failed",
      source.reason ?? source.apiStatus ?? "googleAdsError",
      source.httpStatusCode,
    )
    this.retryable =
      source.retryable ?? isRetryableGoogleAdsStatus(source.httpStatusCode)
    this.isRetryable = this.retryable
    this.apiStatus = source.apiStatus
    this.reason = source.reason
    this.reasonCategory = source.reasonCategory
    this.requestId = source.requestId
    this.responseSnippet = source.responseSnippet
    this.details = source.details
  }
}

/**
 * Maps a failed Google call onto the SDK's error vocabulary: an expired or
 * revoked credential becomes `AuthException` (the SDK then refreshes once and
 * retries, or marks the connection offline); a Google HTTP failure becomes a
 * typed, retryability-aware `GoogleAdsException`. Anything without an HTTP
 * response (timeout, connection reset) is rethrown untouched so the callers'
 * transient-failure classification still applies.
 */
export const rescueGoogleAds = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof SdkException || !isKyHttpError(error)) {
      throw error
    }
    const source = parseGoogleAdsOriginError(error)
    // NOT_ADS_USER is also a 401, but the credential is fine: the Google user
    // simply owns no Ads account, which callers must tell apart from a dead token.
    if (
      source.httpStatusCode === HTTP_UNAUTHORIZED &&
      source.reason !== NOT_ADS_USER_REASON
    ) {
      throw new AuthException("Google Ads credentials were rejected")
    }
    throw new GoogleAdsException(source)
  }
}
