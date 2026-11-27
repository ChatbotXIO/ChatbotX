import { AuthException } from "@chatbotx.io/sdk"
import { refreshAccessToken } from "../apis/auth"
import type { TiktokAuthValue } from "../schema"
import { parseTiktokScopes } from "./scopes"
import { buildTokenTimestamps } from "./token-utils"

/**
 * Trades the stored refresh token for a new access token and returns the auth
 * to persist.
 *
 * The one implementation behind every TikTok refresh path (the SDK's
 * `refreshAuth`, the scheduled refresh job, and the builder's refresh
 * buttons), so they cannot drift apart on what they save.
 *
 * From 2026-12-01 TikTok rotates refresh tokens: every refresh returns a NEW
 * refresh token and invalidates the one just used, keeping the original
 * expiry. The returned auth therefore always carries `refresh_token` from the
 * response, and the caller must persist it before anything else refreshes —
 * which is why every caller holds the integration's auth-store lock.
 */
export async function refreshTiktokAuth(
  auth: TiktokAuthValue,
): Promise<TiktokAuthValue> {
  if (!auth.tokens.refreshToken) {
    throw new AuthException("TikTok refresh token not available")
  }
  const newTokens = await refreshAccessToken(
    { clientId: auth.clientId, clientSecret: auth.clientSecret },
    auth.tokens.refreshToken,
  )
  return {
    ...auth,
    tokens: {
      ...auth.tokens,
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      ...buildTokenTimestamps(
        newTokens.expires_in,
        newTokens.refresh_expires_in,
      ),
    },
    // A refresh never grants a new scope, but it does report the current set
    // — which is how a connection made before scopes were recorded stops
    // being reported as "unknown" without the owner doing anything.
    metadata: {
      ...auth.metadata,
      scopes: parseTiktokScopes(newTokens.scope),
    },
  }
}
