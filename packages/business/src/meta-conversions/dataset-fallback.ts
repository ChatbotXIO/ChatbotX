/**
 * Meta Graph API error codes that mean "this access token is not allowed to
 * perform the call" — a missing permission, an expired/invalid token, or a
 * permissions error. Used to decide when a dataset-creation call is worth
 * retrying with a different token (see `createDatasetWithFallback`).
 *
 * - 10 / 200: permissions error
 * - 100: missing permission (Meta reports "(#100) Missing Permission")
 * - 190: invalid OAuth access token
 */
const META_AUTHORIZATION_ERROR_CODES = new Set([10, 100, 190, 200])

/**
 * True when `error` is a Meta authorization failure (an authorization error
 * code, or an HTTP 401/403). Reads the `code` / `httpStatusCode` fields shared
 * by every channel exception (they all extend the SDK exception), so it works
 * for both the Meta Conversions and WhatsApp conversions error types without
 * depending on either integration package.
 */
export function isMetaAuthorizationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }

  const { code, httpStatusCode } = error as {
    code?: unknown
    httpStatusCode?: unknown
  }
  const numericCode = typeof code === "number" ? code : Number(code)

  return (
    META_AUTHORIZATION_ERROR_CODES.has(numericCode) ||
    httpStatusCode === 401 ||
    httpStatusCode === 403
  )
}

type CreateDatasetWithFallbackInput = {
  /** Preferred token for the create call (e.g. an agency System User token). */
  primaryToken: string
  /**
   * Token to retry with when the primary is rejected for authorization
   * reasons, or `null` when there is no alternative (the create then simply
   * propagates the primary error).
   */
  fallbackToken: string | null
  /** Performs the actual dataset-creation HTTP call with the given token. */
  create: (accessToken: string) => Promise<string>
}

/**
 * Creates a dataset with `primaryToken`, retrying **once** with `fallbackToken`
 * only when Meta rejects the primary token with an authorization error. Any
 * other failure (transient, rate limit, validation) — and the absence of a
 * distinct fallback — propagates unchanged, so a working flow is never
 * regressed and a transient error is never silently doubled.
 */
export async function createDatasetWithFallback(
  input: CreateDatasetWithFallbackInput,
): Promise<string> {
  try {
    return await input.create(input.primaryToken)
  } catch (error) {
    const canRetry =
      input.fallbackToken !== null &&
      input.fallbackToken !== input.primaryToken &&
      isMetaAuthorizationError(error)

    if (canRetry) {
      return await input.create(input.fallbackToken as string)
    }

    throw error
  }
}
