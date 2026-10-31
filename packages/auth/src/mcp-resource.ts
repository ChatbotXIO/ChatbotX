import {
  oauthProviderAuthServerMetadata,
  verifyOAuthQueryParams,
} from "@better-auth/oauth-provider"
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { isAPIError } from "better-auth/api"
import { env, getMcpResourceUrl } from "./keys"
import type { Auth } from "./server"

export type McpAccessTokenSubject = {
  clientId: string
  userId: string
}

// jose error codes that signal a JWKS fetch/config problem rather than a bad
// token; those must surface as server errors, not as a 401.
const JWKS_INFRASTRUCTURE_ERROR_CODES = new Set([
  "ERR_JWKS_TIMEOUT",
  "ERR_JWKS_INVALID",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
])

const isInvalidTokenError = (error: unknown): boolean => {
  // Better Auth wraps an expired, mis-signed, or wrong-audience token in an
  // UNAUTHORIZED APIError (which has no jose `code`); JWKS infrastructure
  // errors escape as raw jose errors and fall through to the check below.
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

/**
 * Verifies an MCP OAuth access token (signature, issuer, audience, expiry).
 * Returns null when the token itself is malformed, expired, or for another
 * audience; infrastructure failures are rethrown.
 */
export const verifyMcpAccessToken = async (
  auth: Auth,
  accessToken: string,
): Promise<McpAccessTokenSubject | null> => {
  const claims = await oauthProviderResourceClient(auth)
    .getActions()
    .verifyBearerToken(accessToken, {
      verifyOptions: { audience: getMcpResourceUrl() },
    })
    .catch((error: unknown) => {
      if (isInvalidTokenError(error)) {
        return null
      }
      throw error
    })

  if (!claims) {
    return null
  }

  if (typeof claims.client_id !== "string" || typeof claims.sub !== "string") {
    return null
  }

  return {
    clientId: claims.client_id,
    userId: claims.sub,
  }
}

export const getMcpAuthorizationServerMetadata = (auth: Auth) =>
  oauthProviderAuthServerMetadata(auth, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  })

export type McpConsentQuery = {
  clientId: string
  scopes: string[]
}

/**
 * Verify the signature and expiry Better Auth put on the consent-page query,
 * then return what the page and action need. Returns null for a forged,
 * expired, or incomplete query, so callers never trust an unverified client id.
 */
export const verifyMcpOAuthQuery = async (
  query: string,
): Promise<McpConsentQuery | null> => {
  if (!(await verifyOAuthQueryParams(query, env.BETTER_AUTH_SECRET))) {
    return null
  }

  const params = new URLSearchParams(query)
  const clientId = params.get("client_id")
  if (!clientId) {
    return null
  }

  return {
    clientId,
    scopes: params.get("scope")?.split(" ").filter(Boolean) ?? [],
  }
}
