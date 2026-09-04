# Workspace API tokens

This document is for developers adding or changing workspace-token (public
API) surfaces. Workspace API tokens are bearer credentials, so their storage,
lookup, and scoping rules are security boundaries.

## Token model

Tokens live in the `WorkspaceApiToken` table
(`packages/database/src/schema/workspace-api-token.ts`). A workspace may hold
several named tokens, capped at `MAX_WORKSPACE_API_TOKENS` (10) — the cap is
enforced inside a transaction under a per-workspace `pg_advisory_xact_lock`
(`workspaceApiTokenRepository.lockWorkspaceTokens`) so concurrent creates
cannot race past it.

Only a SHA-256 digest of the token is persisted (`tokenHash`, unique). The
plaintext is shown exactly once, at creation time. `tokenPrefix` stores the
first 12 characters for display; legacy rows minted before the column existed
have `tokenPrefix: null` and are verified by hash lookup only. New tokens are
minted as `cbx_ws_<random>` by `generateWorkspaceToken()` from
`@chatbotx.io/business/workspace-api-token/credentials` — the single sanctioned
source of bearer-credential material (CSPRNG; never `Math.random()`-backed
helpers). `hashToken()` in the same module is the single hashing
implementation for all API bearer tokens, so generation and verification can
never drift.

Each token carries two orthogonal authorization axes:

| Axis | Values | Enforced where |
| --- | --- | --- |
| `permission` | `full`, `read_only` | `workspaceTokenAuthMidddleware` — a `read_only` token may only use GET/HEAD; DELETE is denied. |
| `scopes` | `null` or an array of resource areas | `requireTokenScope` middleware, composed per-endpoint by `workspaceTokenAuthAPIForScope`. |

`scopes: null` means unrestricted ("All scopes") — every legacy row and every
default row. A non-null array is an explicit allow-list, frozen at creation:
a token scoped to `["contacts"]` is denied every route outside that scope,
including scopes that ship later (only `null` tokens gain future scopes
automatically). Scope values are defined by the `workspaceApiTokenScopes` zod
enum in `packages/database/src/partials/workspace-api-token.ts` and stored as
plain `text[]`, so adding a scope is an enum change, never a migration.

## The default token and `{{api_key}}`

Exactly one row per workspace may have `isDefault = true` (partial unique
index). That row backs the `{{api_key}}` system field and is:

- minted lazily on first `{{api_key}}` resolution
  (`workspaceApiTokenService.resolveDefaultTokenPlaintext`), racing inserts
  resolved by re-select;
- the only token whose plaintext is recoverable after creation — it carries
  `encryptedToken`, an AES-GCM blob bound to its workspace via AAD
  (`workspace-api-token:<workspaceId>`) so it can never be decrypted under
  another workspace;
- always `permission: "full"`, `scopes: null`, and exempt from the token cap;
- upgraded lazily from the deprecated plaintext `Workspace.token` column for
  legacy rows (the column is read-only for this purpose and never consulted
  during auth).

A decrypt failure degrades `{{api_key}}` to `null` in message rendering
(`packages/variables/src/utils.ts`) instead of failing the whole render.

## Auth flow

`workspaceTokenAuthMidddleware` (`apps/builder/src/middlewares/workspace-token-auth.ts`
— triple-d, preserved typo) runs, in order:

1. Extract the token from `Authorization: Bearer <token>`. The `?token=`
   query param is deprecated (leaks into access logs) and only kept for
   existing integrations; its use is logged.
2. Pre-auth IP-keyed rate limit — invalid tokens never reach the
   per-workspace limiter, so this is the defense against token-guessing
   floods.
3. Hash-only lookup: `hashToken(token)` →
   `workspaceApiTokenService.findWorkspaceByTokenHash`, cached up to 300s per
   token hash and tag-invalidated on delete (revocation is normally
   near-instant; the TTL bounds Redis-failure races). Negative lookups are
   never cached.
4. Per-workspace rate limit, scheduled-deletion check (403), the
   `read_only` method gate, and — for mutations only — the owner-quota/trial
   gate (`checkWorkspaceOwnerAccess`), mirroring `workspaceActionClient`. An
   expired workspace stays readable via the public API (invariant #14).
5. The context receives a projected `RequestApiToken`
   (`id`, `workspaceId`, `permission`, `scopes`, `isDefault`) — never the full
   row, so a careless `logger.info({ apiToken })` in a handler cannot leak
   `tokenHash` or `encryptedToken`.

## Adding a workspace-token endpoint

There is deliberately no unscoped `workspaceTokenAuthAPI` export. Every
endpoint must declare its resource scope:

```ts
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")
```

Per-feature workspace-token procedures live in
`features/<feature>/api/workspace-token.ts` (see
`apps/builder/src/features/broadcasts/api/workspace-token.ts` for the
pattern). Register the feature router as a lazy branch in
`apps/builder/src/routers/index.ts` and eagerly in
`apps/builder/src/routers/public.ts` (feeds `/api/public-spec.json`).

Workspace-token APIs authenticate the workspace, not a member — member
permission scoping (e.g. `onlyAssignedContacts`, `emailAndPhone`) does NOT
apply. When a token surface returns contacts or contact-derived data, make the
intended scope explicit in the API contract and tests.

## Adding a new scope value

1. Add the value to `workspaceApiTokenScopes` in
   `packages/database/src/partials/workspace-api-token.ts` (no migration —
   the column is `text[]`).
2. Register it in `workspaceApiTokenScopeRegistry`
   (`apps/builder/src/features/workspaces/lib/workspace-token-scopes.ts`) —
   the `Record<WorkspaceApiTokenScope, …>` type fails compile until you do,
   the same invariant as `Record<ChannelType, …>`.
3. Add the `fields.tokenScopes.<scope>` label to
   `apps/builder/messages/en.json` and every other locale (CI enforces full
   key parity).
4. Use `workspaceTokenAuthAPIForScope("<scope>")` on the new endpoints.

Existing scoped tokens do not gain the new scope; only `null`-scoped tokens
can reach it.

## Token management

- Creating and revoking tokens requires the caller to be a workspace
  `superAdmin` (`requireWorkspaceTokenSuperAdmin`) — a plain member must not
  be able to bypass their granular role by minting a `full` token.
- Create/delete emit audit records (never the raw token or hash), best-effort
  so an audit failure cannot fail a committed write.
- Delete invalidates the token cache tag; a Redis failure there is logged and
  bounded by the 300s TTL.

## Channel API tokens (integration-api)

API-channel credentials (`cbx_api_<random>` tokens and signing secrets) share
the same credentials module: `generateApiChannelToken` /
`generateSigningSecret` / `hashToken` from
`@chatbotx.io/business/workspace-api-token/credentials`. They are verified
hash-only by `channelApiTokenAuthMidddleware` via
`findIntegrationApiByTokenHash`. Do not add a builder-local re-export of
these helpers — import from the business package directly.

## Useful tests

- `apps/builder/__tests__/workspace-token-auth-middleware.test.ts`
- `apps/builder/__tests__/workspace-token-scope-enforcement.test.ts`
- `apps/builder/__tests__/workspace-token-scope-registry.test.ts`
- `apps/builder/__tests__/broadcasts-workspace-token-scope.test.ts`
- `apps/builder/__tests__/create-workspace-token-action.test.ts`
- `apps/builder/__tests__/delete-workspace-token-action.test.ts`
- `apps/builder/__tests__/integration-api-token-hash.test.ts`
- `packages/business/__tests__/workspace-api-token.service.test.ts`
- `packages/variables/__tests__/system-fields.test.ts` (`{{api_key}}`)
