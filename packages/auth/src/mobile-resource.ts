import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { isAPIError } from "better-auth/api"
import { getMobileApiAudience } from "./keys"
import { logger } from "./logger"
import type { Auth } from "./server"

export type MobileAccessTokenSubject = {
  userId: string
  deviceId: string | null
  mustChangePassword: boolean
}

// jose error codes that signal a JWKS fetch/config problem rather than a bad
// token; those must surface as server errors, not as a 401.
const JWKS_INFRASTRUCTURE_ERROR_CODES = new Set([
  "ERR_JWKS_TIMEOUT",
  "ERR_JWKS_INVALID",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
])

export class MobileTokenVerificationUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Mobile token verification is temporarily unavailable", options)
    this.name = "MobileTokenVerificationUnavailableError"
  }
}

const JWT_SEGMENT_COUNT = 3

const decodeBase64Url = (segment: string): string => {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/")
  return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
}

/**
 * Reads the `aud` claim WITHOUT verifying the signature. Only ever used to pick
 * which resource server verifies the token (mobile vs MCP); the chosen branch
 * then verifies signature, issuer, audience and expiry in full.
 */
export const peekJwtAudiences = (token: string): string[] => {
  const segments = token.split(".")
  if (segments.length !== JWT_SEGMENT_COUNT) {
    return []
  }
  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as {
      aud?: unknown
    }
    if (typeof payload.aud === "string") {
      return [payload.aud]
    }
    return Array.isArray(payload.aud)
      ? payload.aud.filter((aud): aud is string => typeof aud === "string")
      : []
  } catch {
    return []
  }
}

/** True when the token claims the mobile REST audience (claim is not yet verified). */
export const isMobileAccessTokenCandidate = (token: string): boolean =>
  peekJwtAudiences(token).includes(getMobileApiAudience())

const isInvalidTokenError = (error: unknown): boolean => {
  if (isAPIError(error)) {
    return error.status === "UNAUTHORIZED"
  }
  const code = (error as { code?: unknown } | null)?.code
  return (
    typeof code === "string" &&
    code.startsWith("ERR_J") &&
    !JWKS_INFRASTRUCTURE_ERROR_CODES.has(code)
  )
}

const isJwksInfrastructureError = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "string" && JWKS_INFRASTRUCTURE_ERROR_CODES.has(code)
}

/**
 * Verifies a mobile access token (signature against the shared JWKS, issuer,
 * audience `<builder>/api`, expiry). Returns null when the token is malformed,
 * expired or for another audience; infrastructure failures are rethrown.
 * Mirrors `verifyMcpAccessToken` with a different audience, so an MCP token
 * never verifies here and a mobile token never verifies there.
 */
export const verifyMobileAccessToken = async (
  auth: Auth,
  accessToken: string,
): Promise<MobileAccessTokenSubject | null> => {
  const { baseURL } = await auth.$context
  const claims = await oauthProviderResourceClient(auth)
    .getActions()
    .verifyBearerToken(accessToken, {
      jwksUrl: `${baseURL}/jwks`,
      verifyOptions: {
        audience: getMobileApiAudience(),
        issuer: new URL(baseURL).origin,
      },
    })
    .catch((error: unknown) => {
      if (isInvalidTokenError(error)) {
        return null
      }
      if (isJwksInfrastructureError(error)) {
        logger.error({ err: error }, "Mobile JWKS verification unavailable")
        throw new MobileTokenVerificationUnavailableError({ cause: error })
      }
      throw error
    })

  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) {
    return null
  }

  return {
    userId: claims.sub,
    deviceId: typeof claims.deviceId === "string" ? claims.deviceId : null,
    mustChangePassword: claims.mustChangePassword === true,
  }
}
