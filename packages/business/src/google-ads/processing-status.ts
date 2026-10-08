import type { GoogleAdsRequestStatus } from "@chatbotx.io/integration-google-ads"

const REASON_PREFIX = "PROCESSING_ERROR_REASON_"

/**
 * Transient `ProcessingErrorReason`s from Data Manager's REST reference
 * (`requestStatus.retrieve`). Google prefixes every value with
 * `PROCESSING_ERROR_REASON_`; the bare form is accepted too. Everything else
 * (invalid click, consent, duplicate, ...) is terminal.
 */
const RETRYABLE_REASONS: ReadonlySet<string> = new Set([
  "INTERNAL_ERROR",
  "TOO_RECENT_CLICK",
  "DESTINATION_TOO_RECENTLY_CREATED",
])

const normalizeReason = (reason: string): string =>
  reason.startsWith(REASON_PREFIX) ? reason.slice(REASON_PREFIX.length) : reason

export const isRetryableProcessingReason = (reason: string): boolean =>
  RETRYABLE_REASONS.has(normalizeReason(reason))

/**
 * Google already holds this conversion (a redrive or manual retry re-sent it):
 * the same order id + action or the same click + time was uploaded before.
 */
const DUPLICATE_REASONS: ReadonlySet<string> = new Set([
  "DUPLICATE_TRANSACTION_ID",
  "DUPLICATE_GCLID",
])

const isDuplicateProcessingReason = (reason: string): boolean =>
  DUPLICATE_REASONS.has(normalizeReason(reason))

export type ProcessingOutcome =
  | { kind: "success"; status: GoogleAdsRequestStatus }
  /** Only duplicate reasons: the conversion is recorded, finish as processed. */
  | { kind: "duplicate"; status: GoogleAdsRequestStatus }
  | { kind: "processing" }
  | { kind: "failed"; retryable: boolean; status: GoogleAdsRequestStatus }
  /** Zero/multiple entries or an unrecognised status — poll again, never guess. */
  | { kind: "unknown" }

/**
 * Reads the outcome of a ONE-event, ONE-destination ingest request. Google's
 * `destination` field is not relied on: exactly one entry is ours, anything
 * else is a protocol surprise. With one event, `PARTIAL_SUCCESS` means the
 * event itself had a problem, so it is a failure.
 */
export const classifyRequestStatus = (
  statuses: GoogleAdsRequestStatus[],
): ProcessingOutcome => {
  if (statuses.length !== 1) {
    return { kind: "unknown" }
  }
  const [status] = statuses
  switch (status.requestStatus) {
    case "SUCCESS":
      return { kind: "success", status }
    case "PROCESSING":
      return { kind: "processing" }
    case "FAILED":
    case "PARTIAL_SUCCESS":
      // Any other reason keeps precedence over a duplicate (as in upload-errors).
      if (
        status.errorCounts.length > 0 &&
        status.errorCounts.every(({ reason }) =>
          isDuplicateProcessingReason(reason),
        )
      ) {
        return { kind: "duplicate", status }
      }
      return {
        kind: "failed",
        status,
        retryable:
          status.errorCounts.length > 0 &&
          status.errorCounts.every(({ reason }) =>
            isRetryableProcessingReason(reason),
          ),
      }
    default:
      return { kind: "unknown" }
  }
}
