import {
  resolveTenantByDomain,
  resolveTenantFromOAuthState,
  withTenant,
} from "@chatbotx.io/auth/tenant"
import { auth } from "@/lib/auth/auth"
import { getGoogleAuthForTenant } from "@/lib/auth/auth-instances"

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
 * redirect URI (the platform host), so on the `/callback/*` leg `x-domain` is the
 * platform host. There we recover the tenant from the persisted OAuth `state`
 * instead — its `callbackURL` carries the originating reseller origin. Without
 * this, a social signup on a reseller domain would be created in the root tenant.
 * See `resolveTenantFromOAuthState`.
 *
 * Google login is white-label: each reseller may sign in with their own Google
 * app. better-auth freezes social-provider config at init, so we dispatch the
 * Google social/callback legs to a per-credential auth instance resolved for the
 * bound tenant (own app, else platform default). Every other route uses the
 * default `auth` instance. See `auth-instances.ts`.
 */
const isGoogleSocialPath = (pathname: string): boolean =>
  pathname.includes("/callback/google") ||
  pathname.endsWith("/sign-in/social") ||
  pathname.endsWith("/sign-up/social")

const handle = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const tenantId = url.pathname.includes("/callback/")
    ? await resolveTenantFromOAuthState(url.searchParams.get("state"))
    : await resolveTenantByDomain(request.headers.get("x-domain"))

  return withTenant(tenantId, async () => {
    const instance = isGoogleSocialPath(url.pathname)
      ? await getGoogleAuthForTenant(tenantId)
      : auth
    return instance.handler(request)
  })
}

export const GET = handle
export const POST = handle
