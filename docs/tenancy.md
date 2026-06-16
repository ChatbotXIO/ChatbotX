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
  to a fixed, pre-registered redirect URI (the **broker host**, see below), so on
  `/callback/*` the request's `x-domain` is the broker host. The tenant is instead
  recovered from the persisted OAuth `state` (its `callbackURL` carries the
  originating reseller origin, exposed by `resolveOAuthStateCallbackURL`). Fails safe
  to the root tenant.
- **Callback relay** — because the provider lands on the broker host, the session
  cookie would otherwise be minted there and never reach the reseller's domain. So
  on the `/callback/*` leg the auth route bounces the callback (same `code` + `state`)
  back to the originating branded host before better-auth processes it, so the
  session cookie is set on the host the user is actually on. `skipStateCookieCheck`
  makes this cross-host hand-off safe (state lives in the DB, not only the cookie).
  This mirrors `resolveRelayTarget` in `apps/builder/src/lib/oauth-referer.ts`, the
  same relay the channel integrations use (`integrations/[...integration]/callback.ts`).

The auth route (`apps/builder/src/app/api/auth/[...all]/route.ts`) binds the tenant
with `withTenant` around the whole better-auth pipeline.

### Per-tenant social OAuth (Google, Facebook)

better-auth freezes social-provider config at init, so one auth instance can sign in
with only one app per provider. To give each reseller their own consent screen,
`apps/builder/src/lib/auth/auth-instances.ts` builds and caches a separate auth
instance per distinct credential (reseller's own app, else platform default), keyed
by `(provider, clientId)`. All instances share the same secret/cookies/adapter, so
sessions are interchangeable. `route.ts` dispatches the social/callback legs to the
right instance (provider read from the `/callback/<provider>` path or the
`sign-in/social` body) and uses the default `auth` instance for everything else.

Providers are listed in `SOCIAL_PROVIDERS` (`packages/auth/src/server.ts`); a tenant
sees a provider's button only when its credential resolves
(`resolveEnabledProvidersForDomain`). **Facebook login reuses the existing Meta app
credential** stored under `type: "messenger"`, so resellers don't register a second
Facebook app just to sign in.

The OAuth `redirect_uri` is always the broker host (each social provider's
`redirectURI` is pinned to it in `buildSocialProviders`), so a reseller using their
**own** provider app must register the *broker* callback URL
(`{broker}/api/auth/callback/<provider>`) in that app's console. The callback then
relays back to the branded host (see "Callback relay" above) so the session lands
there.

## OAuth broker (the "white-label URL")

OAuth providers (Google, Facebook, TikTok, …) only accept a fixed allowlist of
redirect URIs — wildcards and per-reseller domains are rejected. So every OAuth flow
(social SSO **and** channel integrations) lands on a single dedicated, brand-neutral
host — the **broker** — which then relays the callback back to the originating
reseller domain. This is the same pattern GoHighLevel uses with
`marketplace.leadconnectorhq.com`.

- **Config** — `NEXT_PUBLIC_OAUTH_BROKER_URL` (env). Optional; defaults to
  `NEXT_PUBLIC_BUILDER_URL` so single-domain deployments are unaffected. Resolved via
  `getBrokerUrl()` (`packages/auth/src/keys.ts`) and `getBrokerOrigin()` /
  `buildBrokerCallbackUrl()` (`apps/builder/src/lib/oauth-broker.ts`).
- **Where redirect URIs come from** — SSO pins each provider's `redirectURI` in
  `buildSocialProviders` (`packages/auth/src/server.ts`); integrations build theirs
  with `buildBrokerCallbackUrl()` in each `features/integration-*/libs/*.ts` and in
  `integrations/[...integration]/callback.ts` (the token-exchange `redirect_uri` must
  match the authorize-time one). `trustedOrigins` includes the broker, the builder
  URL, and every active custom domain.
- **Relay targets** — `resolveRelayTarget` only relays *from* the broker host, and
  only *to* an origin we control: the builder URL or an active custom domain.
  `sanitizeReferer` enforces the same allowlist, so an attacker-controlled `state`
  cannot drive an open redirect. (Integration `state` is not HMAC-signed; integrity
  rests on this origin allowlist plus the `workspace.ownerId === userId` ownership
  check in the callback. Signing `state` is a possible future hardening.)

### Provider-console registration runbook

Register these exact URIs in each provider's developer console (platform-owned app,
and any reseller-owned app). `{broker}` = `NEXT_PUBLIC_OAUTH_BROKER_URL`:

| Provider | Redirect URI to register |
|----------|--------------------------|
| Google SSO | `{broker}/api/auth/callback/google` |
| Facebook SSO | `{broker}/api/auth/callback/facebook` |
| Google Sheets | `{broker}/integrations/google/callback` |
| TikTok | `{broker}/integrations/tiktok/callback` |
| Messenger | `{broker}/integrations/messenger/callback` |
| Instagram | `{broker}/integrations/instagram/callback` |
| Zalo | `{broker}/integrations/zalo/callback` |

The platform-credential settings UI surfaces the broker callback URL per provider so
resellers can copy the exact value into their own console. Webhook URLs are a
separate, receive-side concern and stay on the reseller's own domain.

## Branding

`resolveTenantSettings` / `resolveTenantSettingsByDomain`
(`packages/business/src/platform/settings.ts`) merge env defaults with the tenant's
branding. The root tenant carries null branding and a suspended tenant falls back to
defaults, so platform workspaces always render defaults.

## Residual security considerations

- **Magic-link / verification tokens are not tenant-scoped.** The `Verification`
  row better-auth writes carries no `tenantId`, so a token issued under one tenant
  and replayed (host rewritten) against another tenant's domain verifies under that
  other tenant. The send path (`server.ts` `magicLink`) only gates whether a link
  is *sent*. A full fix needs a tenant-scoped verification lookup, which better-auth
  does not expose as a hook today; practical exploitation requires intercepting the
  victim's email. Tracked inline at the `magicLink` config.
- **OAuth `state` is not HMAC-signed.** Integrity for the social and integration
  callback relay rests on the origin allowlist (`oauth-referer.ts`) plus the
  `workspace.ownerId === userId` ownership check. Signing `state` is possible future
  hardening.

## Known gap

`tenantService.provisionForOwner` (`packages/business/src/enterprise/tenant/service.ts`)
is idempotent and race-safe but **not yet wired into any onboarding flow** — no path
auto-creates a reseller `Tenant` today. Wiring reseller onboarding is a follow-up.
