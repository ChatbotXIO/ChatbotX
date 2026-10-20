import { parseEnvBool } from "@chatbotx.io/utils"
import { env } from "./keys"
import { logger } from "./logger"
import { GENERIC_OAUTH_PROVIDER_ID } from "./oauth-constants"

export { GENERIC_OAUTH_PROVIDER_ID } from "./oauth-constants"

export type GenericOAuthResolution = {
  providerId: typeof GENERIC_OAUTH_PROVIDER_ID
  clientId: string
  clientSecret: string
  discoveryUrl?: string
  authorizationUrl?: string
  tokenUrl?: string
  userInfoUrl?: string
  scopes: string[]
}

let hasLoggedIncompleteConfig = false

/** The configured provider, or `null` when disabled or incompletely configured. */
export const resolveGenericOAuthConfig = (): GenericOAuthResolution | null => {
  if (!parseEnvBool(env.AUTH_OAUTH_ENABLED)) {
    return null
  }

  const hasProviderUrls = Boolean(
    env.AUTH_OAUTH_DISCOVERY_URL ??
      (env.AUTH_OAUTH_AUTH_URL && env.AUTH_OAUTH_TOKEN_URL),
  )
  if (
    !(
      env.AUTH_OAUTH_CLIENT_ID &&
      env.AUTH_OAUTH_CLIENT_SECRET &&
      hasProviderUrls
    )
  ) {
    if (!hasLoggedIncompleteConfig) {
      hasLoggedIncompleteConfig = true
      logger.error(
        {
          hasAuthorizationUrl: Boolean(env.AUTH_OAUTH_AUTH_URL),
          hasClientId: Boolean(env.AUTH_OAUTH_CLIENT_ID),
          hasClientSecret: Boolean(env.AUTH_OAUTH_CLIENT_SECRET),
          hasDiscoveryUrl: Boolean(env.AUTH_OAUTH_DISCOVERY_URL),
          hasTokenUrl: Boolean(env.AUTH_OAUTH_TOKEN_URL),
        },
        "AUTH_OAUTH_ENABLED is set but the provider is incomplete",
      )
    }
    return null
  }

  return {
    providerId: GENERIC_OAUTH_PROVIDER_ID,
    clientId: env.AUTH_OAUTH_CLIENT_ID,
    clientSecret: env.AUTH_OAUTH_CLIENT_SECRET,
    ...(env.AUTH_OAUTH_DISCOVERY_URL && {
      discoveryUrl: env.AUTH_OAUTH_DISCOVERY_URL,
    }),
    ...(env.AUTH_OAUTH_AUTH_URL && {
      authorizationUrl: env.AUTH_OAUTH_AUTH_URL,
    }),
    ...(env.AUTH_OAUTH_TOKEN_URL && { tokenUrl: env.AUTH_OAUTH_TOKEN_URL }),
    ...(env.AUTH_OAUTH_USERINFO_URL && {
      userInfoUrl: env.AUTH_OAUTH_USERINFO_URL,
    }),
    scopes: (env.AUTH_OAUTH_SCOPES ?? "openid,email,profile")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  }
}

/** True for the three generic OAuth plugin routes. */
export const isGenericOAuthPath = (pathname: string): boolean =>
  pathname.endsWith("/sign-in/oauth2") ||
  pathname.endsWith("/oauth2/link") ||
  pathname.includes("/oauth2/callback/")
