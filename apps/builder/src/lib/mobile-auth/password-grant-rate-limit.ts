import { ChatbotXException } from "@chatbotx.io/business/errors"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"

const MOBILE_TOKEN_PATH_SUFFIX = "/mobile/token"
const PASSWORD_GRANT_ACCOUNT_LIMIT = 5
const RETRY_AFTER_PATTERN = /Retry after (\d+)s\./

type PasswordGrantBody = { grantType?: unknown; email?: unknown }

type PasswordGrantReadResult =
  | { kind: "invalid" }
  | { kind: "other" }
  | { email: string | null; kind: "password" }

const readPasswordGrant = async (
  request: Request,
): Promise<PasswordGrantReadResult> => {
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
    let body: PasswordGrantBody
    if (contentType.includes("application/json")) {
      body = (await request.clone().json()) as PasswordGrantBody
    } else {
      const form = await request.clone().formData()
      body = {
        email: form.get("email"),
        grantType: form.get("grant_type"),
      }
    }
    if (body.grantType !== "password") {
      return { kind: "other" }
    }
    return {
      kind: "password",
      email:
        typeof body.email === "string" ? body.email.trim().toLowerCase() : null,
    }
  } catch {
    return { kind: "invalid" }
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
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname
  if (
    request.method !== "POST" ||
    !normalizedPathname.endsWith(MOBILE_TOKEN_PATH_SUFFIX)
  ) {
    return
  }
  const passwordGrant = await readPasswordGrant(request)
  if (passwordGrant.kind === "other") {
    return
  }
  if (passwordGrant.kind === "invalid") {
    return Response.json(
      {
        code: "BAD_REQUEST",
        message: "Invalid password grant request",
      },
      { status: 400 },
    )
  }
  try {
    if (passwordGrant.email) {
      await assertApiNotRateLimited({
        scope: "mobile-token-password-account-rate-limit",
        key: passwordGrant.email,
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
