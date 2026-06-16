import { SOCIAL_PROVIDERS, type SocialProvider } from "@chatbotx.io/auth/server"
import {
  resolveOAuthStateCallbackURL,
  resolveTenantByDomain,
  resolveTenantFromOAuthState,
  withTenant,
} from "@chatbotx.io/auth/tenant"
import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import { auth } from "@/lib/auth/auth"
import { getSocialAuthForTenant } from "@/lib/auth/auth-instances"
import { resolveRelayTarget } from "@/lib/oauth-referer"

/**
 * Run the better-auth pipeline inside the tenant bound to the request's branded
 * domain, so end-customer sign-in / sign-up / reset / verification resolve users
 * within that reseller's tenant (or the platform when no custom domain matches).
 *
 * The reseller that owns a custom domain can also sign in on that domain: when a
 * scoped lookup misses, the adapter falls back to the tenant owner (`User.id =
 * tenantId`). So a reseller signs into the builder on both the platform URL and
 * their own domain; their sub-accounts only on the reseller's domain. See the
 * findOne reseller-owner fallback in `@chatbotx.io/auth` `server.ts`.
 *
 * OAuth is the exception: the provider redirects to a fixed, pre-registered
 * redirect URI (the broker host — `NEXT_PUBLIC_OAUTH_BROKER_URL`, defaulting to
 * the builder URL), so on the `/callback/*` leg `x-domain` is the broker host.
 * There we recover the tenant from the persisted OAuth `state` instead — its
 * `callbackURL` carries the originating reseller origin. Without this, a social
 * signup on a reseller domain would be created in the root tenant.
 * See `resolveTenantFromOAuthState`.
 *
 * Two further white-label concerns are handled here:
 *
 * 1. Relay — the fixed broker callback must run on the *originating* branded
 *    host, otherwise the session cookie is minted on the broker host and never
 *    reaches the reseller domain the user is on. So on the `/callback/*` leg we
 *    bounce the callback (same code + state) back to that host before handling.
 *    Mirrors the Facebook/TikTok relay in `integrations/[...integration]`.
 *
 * 2. Per-tenant social apps — better-auth freezes social-provider config at init,
 *    so we dispatch the social/callback legs to a per-credential auth instance
 *    resolved for the bound tenant and provider (own app, else platform default).
 *    Every other route uses the default `auth` instance. See `auth-instances.ts`.
 */

/** The provider on a `/callback/<provider>` leg, or `null` if not a social callback. */
const getCallbackProvider = (pathname: string): SocialProvider | null =>
  SOCIAL_PROVIDERS.find((provider) =>
    pathname.endsWith(`/callback/${provider}`),
  ) ?? null

const isSocialSignInPath = (pathname: string): boolean =>
  pathname.endsWith("/sign-in/social") || pathname.endsWith("/sign-up/social")

/**
 * The provider requested on a `sign-in/social` / `sign-up/social` POST. Read from
 * a clone so the original body is left intact for better-auth's own handler.
 */
const getSignInProvider = async (
  request: Request,
): Promise<SocialProvider | null> => {
  try {
    const body = (await request.clone().json()) as { provider?: string }
    return (
      SOCIAL_PROVIDERS.find((provider) => provider === body.provider) ?? null
    )
  } catch {
    return null
  }
}

const handle = async (request: Request): Promise<Response> => {
  // Use the public URL (host behind the proxy), not the raw internal request URL,
  // so the relay host comparison matches the registered platform host.
  const url = getPublicUrlFromRequest(request)
  const isCallback = url.pathname.includes("/callback/")
  const state = url.searchParams.get("state")

  const tenantId = isCallback
    ? await resolveTenantFromOAuthState(state)
    : await resolveTenantByDomain(request.headers.get("x-domain"))

  // Social sign-in/callback must stay strictly tenant-scoped: the reseller-owner
  // fallback in the adapter is suppressed so a social login on a reseller domain
  // resolves to a tenant-scoped user (created when absent) instead of matching the
  // owner's root-tenant platform account. See `isStrictTenantScope` in the adapter.
  const isSocialPath =
    getCallbackProvider(url.pathname) !== null ||
    isSocialSignInPath(url.pathname)

  return withTenant(
    tenantId,
    async () => {
      // White-label relay: when the social flow started on a branded custom domain
      // (or the builder URL) but the provider redirected to the fixed broker
      // callback, bounce back to that origin — where the authorize-time cookies live
      // and where the session cookie must be set — preserving the original code +
      // state. The re-entry runs on the originating host, so this guard does not
      // match again.
      if (isCallback) {
        const callbackURL = await resolveOAuthStateCallbackURL(state)
        const relayTarget = callbackURL
          ? await resolveRelayTarget(url, callbackURL)
          : null
        if (relayTarget) {
          return Response.redirect(relayTarget, 302)
        }
      }

      const provider =
        getCallbackProvider(url.pathname) ??
        (isSocialSignInPath(url.pathname)
          ? await getSignInProvider(request)
          : null)

      const instance = provider
        ? await getSocialAuthForTenant(tenantId, provider)
        : auth

      return instance.handler(request)
    },
    { strictScope: isSocialPath },
  )
}

export const GET = handle
export const POST = handle
