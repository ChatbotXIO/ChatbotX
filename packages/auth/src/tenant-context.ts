import { AsyncLocalStorage } from "node:async_hooks"
import { customDomainService, tenantService } from "@chatbotx.io/business"
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
/**
 * `strictScope` disables the reseller-owner fallback in the adapter (see
 * `server.ts`). It is set on the OAuth social-callback path so that signing in
 * with a social provider on a reseller's domain always resolves to a
 * tenant-scoped user — even for the reseller owner, whose root-tenant account
 * the fallback would otherwise match. Email/password and magic-link keep the
 * fallback (they don't run with this flag), so the owner can still sign in to
 * their platform account on their own domain by those methods.
 */
type TenantStore = { tenantId: string; strictScope?: boolean }

/**
 * The tenant ALS instance MUST be a process-wide singleton. `withTenant` (called
 * from the route handler via `@chatbotx.io/auth/tenant`) and `getTenantId` (called
 * from the adapter in `server.ts` via `./tenant-context`) must read and write the
 * same store. If this module is evaluated more than once — e.g. duplicated across
 * Next.js bundles/layers because it is reached through two different import
 * specifiers — each copy would otherwise own its own `AsyncLocalStorage`, the
 * binding would land in one and the read in the other, and every tenant-scoped
 * write would silently fall back to the root tenant. Pinning to `globalThis`
 * collapses any duplicate evaluations onto one shared store.
 */
const globalForTenant = globalThis as typeof globalThis & {
  __chatbotxTenantStorage?: AsyncLocalStorage<TenantStore>
}

if (!globalForTenant.__chatbotxTenantStorage) {
  globalForTenant.__chatbotxTenantStorage = new AsyncLocalStorage<TenantStore>()
}

const tenantStorage = globalForTenant.__chatbotxTenantStorage

/** Run `fn` with the given tenant bound for the duration of the async call. */
export function withTenant<T>(
  tenantId: string,
  fn: () => T,
  options?: { strictScope?: boolean },
): T {
  return tenantStorage.run({ tenantId, strictScope: options?.strictScope }, fn)
}

/**
 * Whether the current context forbids the reseller-owner fallback — true only on
 * the OAuth social-callback path, where every sign-in must stay tenant-scoped.
 */
export function isStrictTenantScope(): boolean {
  return tenantStorage.getStore()?.strictScope ?? false
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
  if (!customDomain) {
    return ROOT_TENANT_ID
  }

  // A suspended tenant falls back to the platform: its sub-accounts can no longer
  // sign in and the host serves default (platform) branding. `findActiveByDomain`
  // only checks `CustomDomain.status`, so the tenant's own lifecycle is enforced
  // here. Both reads are cache-backed. Mirrors the suspended-tenant fallback in
  // `resolveTenantSettings`.
  const tenant = await tenantService.findById(customDomain.tenantId)
  if (tenant?.status !== "active") {
    return ROOT_TENANT_ID
  }
  return customDomain.tenantId
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

  // Cache-backed (`tenantService.findById`): the reseller-owner fallback in
  // `server.ts` calls this on every missed email lookup for a reseller tenant, so
  // the lookup must not hit the DB each time.
  const tenant = await tenantService.findById(tenantId)
  return tenant?.ownerId ?? null
}

/**
 * Recover the originating `callbackURL` carried in an OAuth `state`.
 *
 * OAuth providers redirect back to a fixed, pre-registered redirect URI (the
 * platform host), so on `/api/auth/callback/*` the request itself no longer
 * carries the reseller's branded origin. better-auth persists the originating
 * origin for us: at sign-in time it writes the `state` to the `Verification`
 * table (`identifier = state`) with a JSON value whose `callbackURL` is the
 * origin the client passed (the reseller's domain — see `sso-sign-in.tsx`).
 *
 * Read-only: the verification row is consumed later by better-auth's own
 * `parseGenericState` in the same request, so we must not delete it here.
 * Returns `null` on any missing/unparseable state or absent `callbackURL`.
 */
export async function resolveOAuthStateCallbackURL(
  state: string | null | undefined,
): Promise<string | null> {
  if (!state) {
    return null
  }

  const [record] = await db
    .select({ value: verificationModel.value })
    .from(verificationModel)
    .where(eq(verificationModel.identifier, state))
    .limit(1)

  if (!record?.value) {
    return null
  }

  try {
    const { callbackURL } = JSON.parse(record.value) as { callbackURL?: string }
    return callbackURL ?? null
  } catch {
    return null
  }
}

/**
 * Recover the tenant on the OAuth callback leg.
 *
 * On `/api/auth/callback/*` the request's `x-domain` is the fixed platform host,
 * not the reseller's branded domain, so `resolveTenantByDomain` would wrongly
 * yield the root tenant. Instead we recover the tenant from the OAuth `state`'s
 * `callbackURL` origin and map it back to a tenant.
 *
 * Fails safe to the root tenant on any missing/unparseable state.
 */
export async function resolveTenantFromOAuthState(
  state: string | null | undefined,
): Promise<string> {
  const callbackURL = await resolveOAuthStateCallbackURL(state)
  if (!callbackURL) {
    return ROOT_TENANT_ID
  }

  try {
    return await resolveTenantByDomain(new URL(callbackURL).hostname)
  } catch {
    return ROOT_TENANT_ID
  }
}
