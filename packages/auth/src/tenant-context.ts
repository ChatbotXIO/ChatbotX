import { AsyncLocalStorage } from "node:async_hooks"
import { customDomainService } from "@chatbotx.io/business"

/**
 * Tenant scoping for white-label isolation.
 *
 * The "tenant" is the reseller that owns the request's domain, or the platform
 * (main site) when no reseller domain matches. It is carried as the current
 * `User.resellerId` value: `null` → platform tenant; a reseller's `User.id` →
 * that reseller's tenant.
 *
 * Auth lookups *by email* (sign-in, password reset, magic link) and user inserts
 * are scoped to the current tenant so the same email can exist as fully isolated
 * accounts across tenants. See `server.ts` for the adapter wrapper that reads
 * `getTenantId()`.
 */
type TenantStore = { tenantId: string | null }

const tenantStorage = new AsyncLocalStorage<TenantStore>()

/** Run `fn` with the given tenant bound for the duration of the async call. */
export function withTenant<T>(tenantId: string | null, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn)
}

/**
 * The tenant bound for the current async context. Defaults to `null` (platform)
 * when nothing is bound — matching main-site behavior and failing safe.
 */
export function getTenantId(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null
}

/**
 * Map a request hostname (the builder proxy's `x-domain` header) to its reseller
 * tenant. Returns the reseller's `User.id` for an active custom domain, or `null`
 * for the platform host (no matching domain). Reuses the cached OSS
 * `customDomainService` — the same mapping `resolvePlatformSettingsByDomain`
 * performs for branding.
 */
export async function resolveTenantByDomain(
  domain: string | null | undefined,
): Promise<string | null> {
  if (!domain) {
    return null
  }

  const customDomain = await customDomainService.findActiveByDomain(domain)
  return customDomain?.userId ?? null
}
