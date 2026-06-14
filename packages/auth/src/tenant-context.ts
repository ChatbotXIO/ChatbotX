import { AsyncLocalStorage } from "node:async_hooks"
import { customDomainService } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import { ROOT_TENANT_ID, verificationModel } from "@chatbotx.io/database/schema"

/**
 * Tenant scoping for white-label isolation.
 *
 * The "tenant" is the reseller `Tenant` that owns the request's domain, or the
 * root tenant (the platform / main site) when no reseller domain matches. It is
 * carried as a `Tenant.id`: `ROOT_TENANT_ID` → platform; any other id → that
 * reseller's tenant. It is NOT a `User.id` — a reseller owns their tenant via
 * `Tenant.ownerId`.
 *
 * Auth lookups *by email* (sign-in, password reset, magic link) and user inserts
 * are scoped to the current tenant so the same email can exist as fully isolated
 * accounts across tenants. See `server.ts` for the adapter wrapper that reads
 * `getTenantId()`.
 */
type TenantStore = { tenantId: string }

const tenantStorage = new AsyncLocalStorage<TenantStore>()

/** Run `fn` with the given tenant bound for the duration of the async call. */
export function withTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn)
}

/**
 * The tenant bound for the current async context. Defaults to the root tenant
 * when nothing is bound — matching main-site behavior and failing safe.
 */
export function getTenantId(): string {
  return tenantStorage.getStore()?.tenantId ?? ROOT_TENANT_ID
}

/**
 * Map a request hostname (the builder proxy's `x-domain` header) to its tenant.
 * Returns the `Tenant.id` for an active custom domain, or the root tenant for the
 * platform host (no matching domain). Reuses the cached OSS `customDomainService`
 * — the same mapping `resolveTenantSettingsByDomain` performs for branding.
 */
export async function resolveTenantByDomain(
  domain: string | null | undefined,
): Promise<string> {
  if (!domain) {
    return ROOT_TENANT_ID
  }

  const customDomain = await customDomainService.findActiveByDomain(domain)
  return customDomain?.tenantId ?? ROOT_TENANT_ID
}

/**
 * The owner `User.id` of a tenant, or `null` for the root tenant (which has no
 * single owner) or an unknown tenant. This is the one cross-tenant read path: it
 * resolves a tenant to *its own* owner only, never another tenant's. See the
 * reseller-owner fallback in `server.ts`.
 */
export async function resolveTenantOwnerId(
  tenantId: string,
): Promise<string | null> {
  if (tenantId === ROOT_TENANT_ID) {
    return null
  }

  const tenant = await db.query.tenantModel.findFirst({
    where: { id: tenantId },
    columns: { ownerId: true },
  })
  return tenant?.ownerId ?? null
}

/**
 * Recover the tenant on the OAuth callback leg.
 *
 * OAuth providers redirect back to a fixed, pre-registered redirect URI (the
 * platform host), so on `/api/auth/callback/*` the request's `x-domain` is the
 * platform host — not the reseller's branded domain — and `resolveTenantByDomain`
 * would wrongly yield the root tenant. Instead we recover the tenant from the
 * OAuth `state`: better-auth persists it in the `Verification` table at sign-in
 * time (`identifier = state`) with a JSON value whose `callbackURL` carries the
 * originating (reseller) origin. We read that origin and map it back to a tenant.
 *
 * Read-only: the verification row is consumed later by better-auth's own
 * `parseGenericState` in the same request, so we must not delete it here. Fails
 * safe to the root tenant on any missing/unparseable state.
 */
export async function resolveTenantFromOAuthState(
  state: string | null | undefined,
): Promise<string> {
  if (!state) {
    return ROOT_TENANT_ID
  }

  const [record] = await db
    .select({ value: verificationModel.value })
    .from(verificationModel)
    .where(eq(verificationModel.identifier, state))
    .limit(1)

  if (!record?.value) {
    return ROOT_TENANT_ID
  }

  try {
    const { callbackURL } = JSON.parse(record.value) as { callbackURL?: string }
    if (!callbackURL) {
      return ROOT_TENANT_ID
    }
    return await resolveTenantByDomain(new URL(callbackURL).hostname)
  } catch {
    return ROOT_TENANT_ID
  }
}
