import {
  resolveTenantByDomain,
  resolveTenantFromOAuthState,
  withTenant,
} from "@chatbotx.io/auth/tenant"
import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth/auth"

const handlers = toNextJsHandler(auth)

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
 * this, a social signup on a reseller domain would be created with `resellerId`
 * null. See `resolveTenantFromOAuthState`.
 */
const withTenantScope =
  (handler: (request: Request) => Promise<Response>) =>
  async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const tenantId = url.pathname.includes("/callback/")
      ? await resolveTenantFromOAuthState(url.searchParams.get("state"))
      : await resolveTenantByDomain(request.headers.get("x-domain"))
    return withTenant(tenantId, () => handler(request))
  }

export const GET = withTenantScope(handlers.GET)
export const POST = withTenantScope(handlers.POST)
