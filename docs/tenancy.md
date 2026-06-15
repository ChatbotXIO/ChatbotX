# White-label tenancy

ChatbotX supports white-label resellers: a reseller runs a branded instance on
their own domain, with their own end-customers, fully isolated from the platform
and from every other reseller. This is modeled by a first-class **`Tenant`** table
(the Auth0-tenant / Vercel-team / Stripe-Connect shape).

## The model

| Concept | Where | Notes |
|---------|-------|-------|
| Tenant | `Tenant` table (`packages/database/src/schema/enterprise/tenant.ts`) | A white-label instance. Holds identity + lifecycle (`status`: `active`/`suspended`) + branding (logos, theme, custom CSS/JS, email templates). |
| Root tenant | `ROOT_TENANT_ID = "1"`, `ownerId` NULL | The platform / main site. Seeded by the `add_tenant_tables` migration. Every default `tenantId` resolves here. |
| Reseller tenant | `Tenant` row with `ownerId` → the reseller `User` | One per reseller (`Tenant_ownerId_key`, partial unique on non-null `ownerId`). |
| Sub-account | `User` row with `tenantId` → a reseller tenant | The reseller's end-customer, isolated inside that tenant. |

`ROOT_TENANT_ID` is defined in `packages/database/src/partials/shared.ts` (not in
`tenant.ts`) so the eager constant sits outside the `tenant.ts` ↔ `auth-user.ts`
circular FK; it is re-exported from `@chatbotx.io/database/schema`.

### Keys

- **`User.tenantId`** — defaults to `ROOT_TENANT_ID`. Email is unique *per tenant*
  (`User_email_tenant_key`), never globally — the same email can exist as fully
  separate accounts across tenants.
- **`Workspace.tenantId`** — owner-derived, never host-derived, via
  `workspaceService.resolveTenantForOwner` (`packages/business/src/workspace/service.ts`):
  a sub-account inherits its own tenant; a reseller gets the tenant they own; a
  plain platform user gets the root tenant.
- **`CustomDomain.tenantId`** — the host → tenant routing key (was `userId`).

When adding a column with `Record<ChannelType, …>`-style fan-out, remember the
relational-query wiring: a new table needs both an `import` and a spread in
`packages/database/src/relations/index.ts` (see `AGENTS.md` invariants).

## Auth scoping

Tenant scoping lives in `packages/auth/src/tenant-context.ts` and `server.ts`.

- **`withTenant(tenantId, fn)` / `getTenantId()`** — an `AsyncLocalStorage` binding.
  `getTenantId()` defaults to `ROOT_TENANT_ID` (never null), so the main site and
  any unbound context fail safe to the platform.
- **Tenant-scoped drizzle adapter** (`createTenantScopedAdapter`) — every better-auth
  `User` lookup *by email* and every `User` insert is constrained to the bound
  tenant. Lookups by id/token are untouched, so sessions stay tenant-neutral.
- **Reseller-owner fallback** — on the reseller's own domain the bound tenant is
  their reseller `Tenant`, but the reseller's own account lives in the root tenant
  (they signed up on the main site). When a scoped email lookup misses, the adapter
  resolves `Tenant.ownerId` and retries by primary key — so a reseller signs in on
  both the platform URL and their own domain; their sub-accounts only on the domain.
- **OAuth state recovery** (`resolveTenantFromOAuthState`) — OAuth providers redirect
  to a fixed, pre-registered redirect URI (the platform host), so on `/callback/*`
  the request's `x-domain` is the platform host. The tenant is instead recovered
  from the persisted OAuth `state` (its `callbackURL` carries the originating
  reseller origin). Fails safe to the root tenant.

The auth route (`apps/builder/src/app/api/auth/[...all]/route.ts`) binds the tenant
with `withTenant` around the whole better-auth pipeline.

### Per-tenant Google OAuth

better-auth freezes social-provider config at init, so one auth instance can sign in
with only one Google app. To give each reseller their own Google consent screen,
`apps/builder/src/lib/auth/auth-instances.ts` builds and caches a separate auth
instance per distinct Google credential (reseller's own app, else platform default).
All instances share the same secret/cookies/adapter, so sessions are interchangeable.

## Branding

`resolveTenantSettings` / `resolveTenantSettingsByDomain`
(`packages/business/src/platform/settings.ts`) merge env defaults with the tenant's
branding. The root tenant carries null branding and a suspended tenant falls back to
defaults, so platform workspaces always render defaults.

## Known gap

`tenantService.provisionForOwner` (`packages/business/src/enterprise/tenant/service.ts`)
is idempotent and race-safe but **not yet wired into any onboarding flow** — no path
auto-creates a reseller `Tenant` today. Wiring reseller onboarding is a follow-up.
