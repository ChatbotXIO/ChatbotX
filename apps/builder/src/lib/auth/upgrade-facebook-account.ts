import type {
  AuthOAuthAccount,
  AuthOAuthAccountPatch,
} from "@chatbotx.io/auth/server"
import { MESSENGER_SCOPES } from "@chatbotx.io/integration-messenger"
import { exchangeLongLivedToken } from "@chatbotx.io/integration-messenger/apis/page"
import { logger } from "@/lib/log"

/**
 * Scopes requested at Facebook SSO login — the same set the Messenger connect
 * flow requests, so the resulting token can later be reused to list Pages
 * without a second OAuth round-trip. See `tryReuseFacebookSsoToken`.
 */
export const FACEBOOK_SSO_SCOPES = MESSENGER_SCOPES

/**
 * Wired into `createAuth` as `upgradeOAuthAccount` for the Facebook SSO
 * instance. better-auth's own code exchange only yields a short-lived user
 * token (~1-2h); this upgrades it to a long-lived one (~60 days) before it's
 * persisted, using the exact credential this closure was built with (see
 * `auth-instances.ts`) — the same app that will later validate the token.
 * Best-effort: on failure the short-lived token is left in place; nothing
 * blocks sign-in.
 */
export function upgradeFacebookAccount(credential: {
  clientId: string
  clientSecret: string
  version: string
}) {
  return async (
    account: AuthOAuthAccount,
  ): Promise<AuthOAuthAccountPatch | undefined> => {
    if (account.providerId !== "facebook" || !account.accessToken) {
      return
    }

    try {
      const accessToken = await exchangeLongLivedToken(
        credential,
        account.accessToken,
      )
      // `exchangeLongLivedToken` doesn't return an expiry; reuse always
      // re-validates live via `debugToken` rather than trusting this column.
      return { accessToken, accessTokenExpiresAt: null }
    } catch (error) {
      logger.warn(
        { err: error },
        "Facebook SSO long-lived token exchange failed",
      )
    }
  }
}
