import { APICallError } from "ai"

const invalidApiKeyStatuses = new Set([401, 403])

/**
 * Gemini answers a bad key with `400 INVALID_ARGUMENT`, not 401, and names the
 * cause in the body's `reason`. A bare 400 is any malformed request, so the
 * reason is what tells the two apart.
 */
const geminiInvalidApiKeyReason = "API_KEY_INVALID"

/**
 * The provider rejected the workspace's API key: wrong, revoked, or without
 * access. Retrying never succeeds until the workspace changes its integration,
 * unlike a rate limit or an outage, so callers fail the work for good.
 */
export function isInvalidApiKeyError(error: unknown): error is APICallError {
  if (!APICallError.isInstance(error)) {
    return false
  }
  const { statusCode } = error
  if (statusCode !== undefined && invalidApiKeyStatuses.has(statusCode)) {
    return true
  }
  return (
    statusCode === 400 &&
    (error.responseBody?.includes(geminiInvalidApiKeyReason) ?? false)
  )
}
