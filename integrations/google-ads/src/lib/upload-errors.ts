import { z } from "zod"

/**
 * Classification of a legacy `uploadClickConversions` partial failure.
 *
 * Enum names are those of Google's `ConversionUploadErrorEnum.ConversionUploadError`
 * (checked against the googleapis proto of Google Ads API v23; v25 was not
 * retrievable, so a value added since is simply "permanent" here).
 * The gRPC code of `google.rpc.Status` is NEVER mapped to an HTTP status.
 */

export const NOT_ALLOWLISTED_REASON =
  "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE"

/** The same click + conversion action was already uploaded / the order id is already in use. */
const DUPLICATE_REASONS: ReadonlySet<string> = new Set([
  "CLICK_CONVERSION_ALREADY_EXISTS",
  "ORDER_ID_ALREADY_IN_USE",
])

/** Google has not caught up yet: the same upload is valid later (6 h gate). */
const TOO_RECENT_REASONS: ReadonlySet<string> = new Set([
  "TOO_RECENT_EVENT",
  "TOO_RECENT_CONVERSION_ACTION",
])

/** Google-side transient errors, by error family. */
const TRANSIENT_REASONS: ReadonlySet<string> = new Set([
  "RESOURCE_EXHAUSTED",
  "RESOURCE_TEMPORARILY_EXHAUSTED",
  "INTERNAL_ERROR",
  "TRANSIENT_ERROR",
  "CONCURRENT_DATA_MODIFICATION",
  "DEADLINE_EXCEEDED",
])
const TRANSIENT_CATEGORIES: ReadonlySet<string> = new Set([
  "quotaError",
  "internalError",
])

/** gRPC codes of `google.rpc.Status` that mean "try again": DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, INTERNAL, UNAVAILABLE. */
const TRANSIENT_RPC_CODES: ReadonlySet<number> = new Set([4, 8, 13, 14])
const TRANSIENT_RPC_STATUSES: ReadonlySet<string> = new Set([
  "DEADLINE_EXCEEDED",
  "RESOURCE_EXHAUSTED",
  "INTERNAL",
  "UNAVAILABLE",
])

const REASON_PATTERN = /^[A-Z0-9_]{1,80}$/
const MAX_REPORTED_REASONS = 5

const optionalOf = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined)

const failureErrorSchema = z.object({
  errorCode: optionalOf(z.record(z.string(), z.unknown())),
})

const failureDetailSchema = z.object({
  errors: z.array(failureErrorSchema.catch({})).optional().catch(undefined),
})

/** `google.rpc.Status` carrying a `GoogleAdsFailure` in `details`. */
export const partialFailureErrorSchema = z.object({
  code: optionalOf(z.number()),
  status: optionalOf(z.string()),
  details: z.array(failureDetailSchema.catch({})).optional().catch(undefined),
})
export type PartialFailureError = z.infer<typeof partialFailureErrorSchema>

export type UploadErrorClass =
  | { kind: "notAllowed" }
  | { kind: "duplicate" }
  | { kind: "retry"; reason: "tooRecent" | "transient" }
  | { kind: "permanent"; reasons: string[]; firstCategory?: string }
  | { kind: "malformed" }

type FoundError = { category: string; reason: string }

const collectErrors = (error: PartialFailureError): FoundError[] =>
  (error.details ?? []).flatMap((detail) =>
    (detail.errors ?? []).flatMap((item) =>
      Object.entries(item.errorCode ?? {}).flatMap(([category, value]) =>
        typeof value === "string" ? [{ category, reason: value }] : [],
      ),
    ),
  )

const boundReason = (reason: string): string =>
  REASON_PATTERN.test(reason) ? reason : "UNKNOWN"

const isTransient = (found: FoundError): boolean =>
  TRANSIENT_REASONS.has(found.reason) ||
  TRANSIENT_CATEGORIES.has(found.category)

const hasTransientRpcStatus = (error: PartialFailureError): boolean =>
  (error.code !== undefined && TRANSIENT_RPC_CODES.has(error.code)) ||
  (error.status !== undefined && TRANSIENT_RPC_STATUSES.has(error.status))

/** Whether the failure names at least one Google Ads error code (a classifiable `GoogleAdsFailure`). */
export const hasUploadErrors = (error: PartialFailureError): boolean =>
  collectErrors(error).length > 0

/**
 * Precedence: not-allowlisted > permanent > duplicate > transient. A single
 * permanent error means the request will never succeed as sent, so it wins
 * over a transient companion; duplicates only count when nothing else failed.
 */
export const classifyUploadErrors = (
  error: PartialFailureError,
): UploadErrorClass => {
  const found = collectErrors(error)
  if (found.length === 0) {
    return hasTransientRpcStatus(error)
      ? { kind: "retry", reason: "transient" }
      : { kind: "malformed" }
  }
  if (found.some(({ reason }) => reason === NOT_ALLOWLISTED_REASON)) {
    return { kind: "notAllowed" }
  }
  const permanent = found.filter(
    (entry) =>
      !(
        DUPLICATE_REASONS.has(entry.reason) ||
        TOO_RECENT_REASONS.has(entry.reason) ||
        isTransient(entry)
      ),
  )
  if (permanent.length > 0) {
    return {
      kind: "permanent",
      firstCategory: permanent[0]?.category,
      reasons: permanent
        .slice(0, MAX_REPORTED_REASONS)
        .map(({ reason }) => boundReason(reason)),
    }
  }
  if (found.every(({ reason }) => DUPLICATE_REASONS.has(reason))) {
    return { kind: "duplicate" }
  }
  if (found.some(({ reason }) => TOO_RECENT_REASONS.has(reason))) {
    return { kind: "retry", reason: "tooRecent" }
  }
  return { kind: "retry", reason: "transient" }
}
