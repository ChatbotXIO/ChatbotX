import { ChatbotXException } from "@chatbotx.io/business/errors"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"

export const MOBILE_TOKEN_PATH_SUFFIX = "/mobile/token"

// The window is the shared 10s API window. 3 per IP is better-auth's own rule
// for `/sign-in/email`; the per-account bucket additionally stops a botnet from
// spreading guesses for one mailbox across many IPs.
const PASSWORD_GRANT_IP_LIMIT = 3
const PASSWORD_GRANT_ACCOUNT_LIMIT = 5
const RETRY_AFTER_PATTERN = /Retry after (\d+)s\./

type PasswordGrantBody = { grantType?: unknown; email?: unknown }

const readPasswordGrantEmail = async (
  request: Request,
): Promise<string | null | undefined> => {
  try {
    const body = (await request.clone().json()) as PasswordGrantBody
    if (body.grantType !== "password") {
      return
    }
    return typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : null
  } catch {
    return
  }
}

/**
 * Throttles the `password` grant of `POST /api/auth/mobile/token` the same way
 * `/sign-in/email` is throttled, since it is the same credential-guessing
 * surface. Returns a 429 response when limited, `undefined` otherwise (also for
 * every other grant and path, which carry no password to guess).
 */
export const rateLimitMobilePasswordGrant = async (
  request: Request,
  pathname: string,
): Promise<Response | undefined> => {
  if (
    request.method !== "POST" ||
    !pathname.endsWith(MOBILE_TOKEN_PATH_SUFFIX)
  ) {
    return
  }
  const email = await readPasswordGrantEmail(request)
  if (email === undefined) {
    return
  }
  try {
    await assertApiNotRateLimited({
      scope: "mobile-token-password-ip-rate-limit",
      key: getGuestClientIp(request.headers),
      limit: PASSWORD_GRANT_IP_LIMIT,
    })
    if (email) {
      await assertApiNotRateLimited({
        scope: "mobile-token-password-account-rate-limit",
        key: email,
        limit: PASSWORD_GRANT_ACCOUNT_LIMIT,
      })
    }
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "tooManyRequests"
    ) {
      const retryAfter = error.message.match(RETRY_AFTER_PATTERN)?.[1]
      return Response.json(
        {
          code: "TOO_MANY_REQUESTS",
          message: "Too many sign-in attempts. Please try again later.",
        },
        {
          status: 429,
          headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        },
      )
    }
    throw error
  }
}
