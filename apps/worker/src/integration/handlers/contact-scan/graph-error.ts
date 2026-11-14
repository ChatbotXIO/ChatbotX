import {
  type ChannelError,
  ChannelErrorCategory,
  isRateLimited,
} from "@chatbotx.io/sdk"
import { isRetryable, readOriginError } from "../shared/http-retry"
import type { ContactScanErrorClassification } from "./adapter"

const HTTP_TOO_MANY_REQUESTS = 429

/**
 * Maps a thrown provider error to the engine's classification through the
 * channel's OWN error mapper (`mapToChannelError` of its integration package),
 * so no provider error code lives here: the code tables stay in
 * `integrations/<channel>/src/lib/error-mapper.ts` and a new rate-limit code is
 * one edit there.
 *
 * Decision order (first match wins):
 *  1. rateLimited     - the mapper says so (`isRateLimited`), or a bare HTTP 429
 *  2. retryable       - a network failure, a 5xx, or a timeout / dropped socket
 *  3. tokenInvalid    - `AUTH_FAILED`
 *  4. graphPermission - `PERMISSION_DENIED`
 *  5. unknown         - anything else
 */
export const classifyChannelErrorForScan = (input: {
  error: unknown
  mapToChannelError: (error: unknown) => ChannelError
}): ContactScanErrorClassification => {
  const mapped = input.mapToChannelError(input.error)

  if (
    isRateLimited(mapped) ||
    mapped.httpStatusCode === HTTP_TOO_MANY_REQUESTS
  ) {
    return "rateLimited"
  }

  if (
    mapped.category === ChannelErrorCategory.NETWORK_ERROR ||
    isRetryable(input.error) ||
    isRetryable(readOriginError(input.error))
  ) {
    return "retryable"
  }

  if (mapped.category === ChannelErrorCategory.AUTH_FAILED) {
    return "tokenInvalid"
  }

  if (mapped.category === ChannelErrorCategory.PERMISSION_DENIED) {
    return "graphPermission"
  }

  return "unknown"
}
