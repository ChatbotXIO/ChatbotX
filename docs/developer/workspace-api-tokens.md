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

The `analytics` scope covers both `/v1/error-logs`
(`apps/builder/src/features/error-logs/api/public.ts`) and, as of the public
analytics router, every `/v1/analytics/*` route
(`apps/builder/src/features/analytics/api/public.ts`).

The `appointments` scope existed in the enum and UI registry for some time
before any endpoint used it — see "Appointments scope — endpoint-to-scope
table" below for the full surface now behind it.

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
`features/<feature>/api/public.ts` (see
`apps/builder/src/features/broadcasts/api/public.ts` for the
pattern), exporting a named `<resource>PublicRouter` with CRUD-style keys
(`list`, `get`, `create`, `update`, `delete`). Register it eagerly, nested
under the resource name, in `apps/builder/src/routers/public.ts` (feeds
`/api/spec.json`); a feature with no private/session procedures is not
mounted in `apps/builder/src/routers/index.ts` at all.

Workspace-token APIs authenticate the workspace, not a member — member
permission scoping (e.g. `onlyAssignedContacts`, `emailAndPhone`) does NOT
apply. `contactService.list` (unscoped — the public API handler passes no
`scope`) and `contactService.findPublicContactOrFail` always run "unscoped":
a token sees every contact in the workspace, with full email/phone (no PII
masking), regardless of any member's `emailAndPhone`/`onlyAssignedContacts`
permission. The private path resolves a `scope` from the member's
permissions and calls the same `contactService.list` method — see
`.agents/skills/business-data-access/SKILL.md`. When a token surface returns
contacts or contact-derived data, make the intended scope explicit in the
API contract and tests.

## Scope notes

The full endpoint-to-scope mapping is generated, not hand-maintained here —
see `/api/spec.json` (built from `apps/builder/src/routers/public.ts`) for
the authoritative, current list, and
`apps/builder/__tests__/*-public-scope.test.ts` for the tests that enforce
each feature's scope assignment at compile/test time (e.g.
`contacts-public-scope.test.ts`, `broadcasts-public-scope.test.ts`,
`appointments-public-scope.test.ts`, `sequences-public-scope.test.ts`,
`integrations-public-scope.test.ts`, `analytics-public-scope.test.ts`,
`conversations-public-scope.test.ts`, `products-public-scope.test.ts`,
`product-categories-public-scope.test.ts`, `coupons-public-scope.test.ts`).

What follows are the scope-assignment decisions and gotchas that aren't
derivable from the code or those tests — read before adding or reassigning
an endpoint's scope.

- **Contacts** — Contacts' public surface is split by concern across
  submodules — some in `features/contacts/api/public/` (`crud.ts`,
  `tags.ts`, `custom-fields.ts`, `bulk.ts`, `export.ts`,
  `refresh-profile.ts`, `messages.ts`), some in their own owning feature's
  `api/public.ts` (`contact-notes`, `contact-sequences`, `contact-inboxes`,
  `contact-filter`) that `features/contacts/api/public.ts` composes in
  alongside its own submodules — and every one of them other than
  `messages.ts` calls `workspaceTokenAuthAPIForScope("contacts")` exactly
  once at import. `messages.ts` is the one exception: sending/reading
  messages, auto-replies, and flows for a contact are conversation/automation
  operations even though they hang off `/v1/contacts/{identifier}/...`, so it
  uses `inbox` (`sendMessage`, `listMessages`, `getMessage`) and `automation`
  (`triggerAutoReply`, `sendFlow`) instead.
  `apps/builder/__tests__/contacts-public-scope.test.ts` enforces this split
  — it fails compile/test if a new submodule (wherever it lives) forgets to
  declare a scope, or if `messages.ts`'s procedures drift onto `contacts`.

- **Automation** — covers flows, triggers, keywords (automated responses),
  AI agents, ref links, and AI triggers — a full CRUD surface so an agent can
  build, publish, and inspect automations without human help via the builder
  UI. Two invariants:
  - *Keywords `type` filter* — `AutomatedResponse` serves two `FolderType`s
    off one table (`automatedResponse` for inbound/Contact,
    `outboundAutomatedResponse` for outbound/Page), disambiguated by the
    `type` column (invariant #17 in the root `AGENTS.md`). `type` must stay
    in the where-clause on every keywords path — never let it become fully
    optional in a way that drops the filter.
  - *`GET /v1/triggers` and `GET /v1/triggers/{id}` return real conditions
    and actions*, not the empty arrays the routes returned before this scope
    was widened. Any future trigger route must keep populating both via
    `triggerRepository.findWithConditions` rather than reintroducing a
    hardcoded `[]`.

- **Appointments** — covers appointment calendars, appointments, reminder
  dispatch audit reads, and external (Google/Outlook) calendar connections.
  Three invariants:
  - *`appUrl` must be resolved with `resolveTenantSettings`, never a
    `.query.ts` adapter.* `appointmentService.list` signs a per-row schedule
    token using `appUrl`, and the private `list-appointments.query.ts`
    adapter gets it via `assertCurrentUserCanAccessChatbot`, which resolves a
    better-auth session — a Bearer-token request has none. The public `list`
    handler in `features/appointments/api/public.ts` calls
    `resolveTenantSettings({ workspaceId })` directly instead, exactly like
    the invariant `public-list-queries-no-session.test.ts` pins for every
    other resource.
  - *External calendars must use `listWithConnectedCount`, never `list`.*
    `appointmentExternalCalendarService.list` returns raw `Integration` rows
    via a relational query; the sibling `IntegrationGoogleCalendar` table
    holds the OAuth token blob in its `auth` jsonb column.
    `listWithConnectedCount` selects explicit columns and never touches
    `auth` — it is the only safe shape to publish on this scope.
  - *Reminder dispatch listing must always pass `workspaceId` explicitly.*
    `AppointmentReminderDispatchListInput.workspaceId` is optional at the
    repository layer (it also backs the internal due-reminder scan across
    every workspace), so the public handler in
    `features/appointment-management/api/public.ts` must never omit it —
    omitting it would return dispatch rows across every workspace, not just
    the caller's.

- **Inbox** — covers conversations, conversation-scoped messages, inboxes
  (channels), saved replies (canned responses), workspace members (agents),
  and — enterprise only — teams, so an integration can build a full helpdesk
  client without a human session. Conversation and message mutations take a
  single resource id (`/v1/conversations/{id}/...`), not the private API's
  bulk-by-ids shape — and every one omits an actor (`assignedBy`/`userId`):
  a workspace token authenticates the workspace, not a user, and the
  underlying service methods already treat that field as optional. Also on
  this scope: `POST /v1/contacts/{identifier}/messages`, `GET .../messages`,
  and `GET .../messages/{messageId}` in `contacts/api/public/messages.ts` —
  see the Contacts note above for why those live under `inbox` despite their
  path. Three invariants:
  - *`conversationService.updateAssignment` scopes its `WHERE` by
    `workspaceId`, not just conversation id* — it was missing that clause
    until this scope's public routes were added, which would have made a
    bulk-by-ids assignment endpoint a cross-tenant write. Any future write on
    this service must scope by `workspaceId` the same way
    `updateArchived`/`updateBotEnabled` already do; don't reintroduce an
    `inArray(id, ids)`-only `WHERE`.
  - *`findConversation`/`findMessage` never resolve a better-auth session* —
    they used to call `assertCurrentUserCanAccessChatbot`, which throws for a
    Bearer-token request (no session exists).
    `apps/builder/__tests__/public-list-queries-no-session.test.ts` pins this
    for every public query function; add a new one there whenever a query
    function gains a public caller.
  - *Public message `create` sends without a `user`* — `messageService
    .createOutgoing`'s `user` param is optional specifically so a workspace
    token (which has no user) can send; don't reintroduce a
    `userService.findByIdOrFail(context.user.id)` call on this path the way
    the private API needs one for `tenantId`.

- **Broadcasts** — covers broadcasts, sequences, **and** WhatsApp message
  templates — three features share it because sequences and message
  templates are broadcast-adjacent operations, not because they were
  designed together. The token picker only shows the bare label "Broadcasts"
  (`fields.tokenScopes.broadcasts`), so a superAdmin minting a `broadcasts`
  token should know it also grants full sequence CRUD (including deleting
  sequences and steps) and WhatsApp template listing — there is no
  finer-grained scope to withhold just one of the three. Two things worth
  knowing:
  - *`GET /v1/broadcasts/{idOrName}/audience` returns full contact PII*
    (email, phone, gender) with no field-level gating, including for a
    `read_only` token — unlike the write paths (`create`/`updateDraft`/
    `resendWithPruning`), which prune email/phone *filter conditions*
    through `pruneEmailPhoneFilterConditions` before persisting. This is
    deliberate, not an oversight: minting any workspace token already
    requires workspace superAdmin, who has full contact PII in the UI
    regardless. A `read_only` `broadcasts` token is still, in effect, a bulk
    contact-PII export path for every broadcast's audience — call this out
    to anyone issuing such a token for a narrower purpose.
  - *`upsertStep`'s request body has no `sequenceId` field* — the `{id}`
    path segment is the sole source of truth for which sequence a step
    belongs to. `publicUpsertSequenceStepRequest`
    (`features/sequences/schema/action.ts`) omits `sequenceId` from the
    shared base shape the private `upsertSequenceStepRequest` also uses. Do
    not add it back; a client-supplied `sequenceId` that disagreed with the
    path would have nothing enforcing which one wins.

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
- `apps/builder/__tests__/broadcasts-public-scope.test.ts`,
  `sequences-public-scope.test.ts`
- `apps/builder/__tests__/appointments-public-scope.test.ts`
- `apps/builder/__tests__/appointment-calendars-public-api.test.ts`,
  `appointments-public-api.test.ts`, `appointment-reminders-public-api.test.ts`,
  `appointment-external-calendars-public-api.test.ts` — handler-behavior tests
  for the appointments scope's four routers
- `apps/builder/__tests__/contacts-public-scope.test.ts`
- `apps/builder/__tests__/contacts-crud-public-api.test.ts`,
  `contacts-tags-and-fields-public-api.test.ts`,
  `contacts-notes-public-api.test.ts`, `contacts-sequences-public-api.test.ts`,
  `contacts-inboxes-public-api.test.ts`, `contacts-filter-fields-public-api.test.ts`,
  `contacts-export-public-api.test.ts`, `contacts-export-files-public-api.test.ts`,
  `contacts-bulk-public-api.test.ts`, `contacts-refresh-profile-public-api.test.ts`,
  `folders-public-api.test.ts` — handler-behavior tests, one per public-API
  submodule (some under `features/contacts/api/public/`, some in the owning
  sibling feature's own `api/public.ts`)
- `apps/builder/__tests__/create-workspace-token-action.test.ts`
- `apps/builder/__tests__/delete-workspace-token-action.test.ts`
- `apps/builder/__tests__/integration-api-token-hash.test.ts`
- `packages/business/__tests__/workspace-api-token.service.test.ts`
- `packages/variables/__tests__/system-fields.test.ts` (`{{api_key}}`)
