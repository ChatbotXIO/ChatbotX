import { SdkException } from "@chatbotx.io/sdk"

/** A 429 (rate limit) or any 5xx is worth retrying; anything else is not. */
const isRetryableStatus = (status: number): boolean =>
  status === 429 || status >= 500

/**
 * Whether an error is an HTTP failure worth retrying — a 429 (rate limit) or
 * any 5xx. Channel-agnostic, so both the coexist handlers and the contact-scan
 * classifier can depend on it without reaching into channel code.
 *
 * Recognises two shapes: the raw ky-style HTTP error (`error.response.status`)
 * AND the channel integrations' wrapped `SdkException`, which carries the
 * status as a FLAT `httpStatusCode` field (a `MessengerAPIException` /
 * `InstagramAPIException` has no `.response`). Both channels' `rescue()` wrap
 * every Graph failure into an `SdkException` before it reaches `withInlineRetry`,
 * so without the flat-field branch inline retry never fires for real provider
 * errors.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof SdkException) {
    return isRetryableStatus(error.httpStatusCode)
  }

  if (
    error != null &&
    typeof error === "object" &&
    "response" in error &&
    error.response != null &&
    typeof error.response === "object" &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return isRetryableStatus(error.response.status)
  }

  return false
}
