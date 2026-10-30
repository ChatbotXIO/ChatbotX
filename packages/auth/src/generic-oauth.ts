import { env } from "./keys"
import { logger } from "./logger"
import { GENERIC_OAUTH_PROVIDER_ID } from "./oauth-constants"

type GenericOAuthBase = {
  providerId: typeof GENERIC_OAUTH_PROVIDER_ID
  clientId: string
  clientSecret: string
  userInfoUrl?: string
  scopes: string[]
}

/**
 * The validated provider shape: either OIDC discovery, or an explicit
 * authorization + token URL pair — never a half-configured mix of both.
 * `keys()`'s `createFinalSchema` enforces this invariant at process start
 * (outside `SKIP_ENV_CHECK` builds); the fallback below only covers the
 * build-time bypass.
 */
export type GenericOAuthResolution = GenericOAuthBase &
  (
    | { discoveryUrl: string; authorizationUrl?: never; tokenUrl?: never }
    | { discoveryUrl?: never; authorizationUrl: string; tokenUrl: string }
  )

let hasLoggedIncompleteConfig = false

const logIncompleteConfigOnce = () => {
  if (hasLoggedIncompleteConfig) {
    return
  }
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

/**
 * The configured provider, or `null` when disabled or incompletely
 * configured. `keys()` already rejects an incomplete config at process start
 * when validation runs, so this branch is only reachable under
 * `SKIP_ENV_CHECK` (local dev / build-time env collection).
 */
export const resolveGenericOAuthConfig = (): GenericOAuthResolution | null => {
  if (!env.AUTH_OAUTH_ENABLED) {
    return null
  }
  if (!(env.AUTH_OAUTH_CLIENT_ID && env.AUTH_OAUTH_CLIENT_SECRET)) {
    logIncompleteConfigOnce()
    return null
  }

  const base: GenericOAuthBase = {
    providerId: GENERIC_OAUTH_PROVIDER_ID,
    clientId: env.AUTH_OAUTH_CLIENT_ID,
    clientSecret: env.AUTH_OAUTH_CLIENT_SECRET,
    scopes: env.AUTH_OAUTH_SCOPES.split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    ...(env.AUTH_OAUTH_USERINFO_URL && {
      userInfoUrl: env.AUTH_OAUTH_USERINFO_URL,
    }),
  }

  if (env.AUTH_OAUTH_DISCOVERY_URL) {
    return { ...base, discoveryUrl: env.AUTH_OAUTH_DISCOVERY_URL }
  }
  if (env.AUTH_OAUTH_AUTH_URL && env.AUTH_OAUTH_TOKEN_URL) {
    return {
      ...base,
      authorizationUrl: env.AUTH_OAUTH_AUTH_URL,
      tokenUrl: env.AUTH_OAUTH_TOKEN_URL,
    }
  }

  logIncompleteConfigOnce()
  return null
}

let hasLoggedUnlicensed = false

/**
 * Logs once when SSO is configured but the enterprise license check fails, so
 * a lapsed or missing license shows up in logs instead of only as a silent
 * 404 (the route gate) or a button that quietly never renders (the sign-in
 * page). Callers pass their own `hasEnterpriseFeatures()` result rather than
 * this module calling it directly, since that check lives in
 * `@chatbotx.io/business` and is request-scoped (host-dependent license).
 */
export const warnIfGenericOAuthUnlicensed = (isLicensed: boolean): void => {
  if (isLicensed || hasLoggedUnlicensed || !resolveGenericOAuthConfig()) {
    return
  }
  hasLoggedUnlicensed = true
  logger.warn(
    {},
    "AUTH_OAUTH_ENABLED is configured but the enterprise license check failed; SSO stays unavailable until a valid license is present",
  )
}

/**
 * Matches the generic provider's callback, or a social sign-in request that
 * explicitly selects this provider. A shared `/sign-in/social` route must not
 * gate Google or Facebook when enterprise SSO is unavailable.
 */
export const isGenericOAuthPath = (
  pathname: string,
  provider?: string,
): boolean =>
  pathname.endsWith(`/callback/${GENERIC_OAUTH_PROVIDER_ID}`) ||
  (provider === GENERIC_OAUTH_PROVIDER_ID &&
    (pathname.endsWith("/sign-in/social") ||
      pathname.endsWith("/sign-up/social")))
