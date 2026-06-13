import { resolveTenantByDomain, withTenant } from "@chatbotx.io/auth/tenant"
import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth/auth"

const handlers = toNextJsHandler(auth)

/**
 * Run the better-auth pipeline inside the tenant bound to the request's branded
 * domain, so end-customer sign-in / sign-up / reset / verification resolve users
 * within that reseller's tenant (or the platform when no custom domain matches).
 */
const withTenantScope =
  (handler: (request: Request) => Promise<Response>) =>
  async (request: Request): Promise<Response> => {
    const tenantId = await resolveTenantByDomain(request.headers.get("x-domain"))
    return withTenant(tenantId, () => handler(request))
  }

export const GET = withTenantScope(handlers.GET)
export const POST = withTenantScope(handlers.POST)
