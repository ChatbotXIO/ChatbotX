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
  `contact-filter`, `import`) that `features/contacts/api/public.ts`
  composes in alongside its own submodules, and `contact-scan` — the one
  submodule composed directly into `apps/builder/src/routers/public.ts`
  under its own `contactScans` top-level key instead of through
  `features/contacts/api/public.ts`. Every one of them other than
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
  AI agents, AI MCP servers, AI functions, AI files, and ref links — a full
  CRUD surface so an agent can build, publish, and inspect automations
  without human help via the builder UI. AI triggers were retired (dropped
  from the schema and this scope) in favor of the AI files/functions/MCP
  servers surface. Two invariants:
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

- **Media** — this scope shipped in the enum/registry/i18n alongside `ads`
  but, like `ads`, carried no endpoints for a while. It now covers real
  workspace resources: the media library (folders/files CRUD, move,
  favourite) and dynamic (templated) images CRUD. As with every other
  scope, each public handler calls the same `packages/business` service
  method the private/action code calls; no business logic was duplicated
  to publish these. Three things worth knowing:
  - *Uploading a file is a three-step handshake, not a single call* —
    `mediaLibraryService.createFile` only accepts a `path` already living
    under the workspace's own storage prefix, and a workspace token has no
    session to hit the session-authenticated `/api/presigned-upload` route.
    `POST /v1/media-library/files/upload-url` mints a server-derived,
    workspace-scoped key (`presignUpload`) plus a 5-minute presigned `PUT`
    URL; the client `PUT`s the bytes to that URL, then calls
    `POST /v1/media-library/files` with the same `path` to register it.
    The key is never accepted from the caller — only the derived one is
    valid, closing the same cross-workspace vector `createFile`'s prefix
    check exists to guard.
  - *`GET /v1/media-library/files`'s `filter`/`folderId` precedence* —
    `filter: "favourite"` spans every folder and ignores `folderId`;
    `filter: "all"` and `filter: "recent"` both span every folder,
    differing only in sort order; omitting both `filter` and `folderId`
    lists root-level files only. See the comment on
    `mediaLibraryFileRepository.list`
    (`packages/database/src/repositories/media-library-file/repository.ts`)
    before changing this branch.
  - *`dynamicImages.*` never returns a raw storage key* — the DB column
    `DynamicImage.backgroundUrl` is a storage path, so every public route
    resolves it to a fetchable URL via
    `dynamicImageService.resolveBackgroundUrls` (batched once per request,
    not once per row) and also stamps an `imageUrl` trigger URL
    (`<brokerOrigin>/dynamic-images?dynamicImageId=<id>&userId={{user_id}}`)
    — the same template the builder's edit page shows the user. Never
    publish the bare `backgroundUrl` column value.

- **Channels** — see the dedicated table below.

### Channels scope — endpoint-to-scope table

`channels` shipped in the enum/registry/i18n alongside `ads` but, like `ads`,
carried no endpoints for a while. It now covers user persistent menus
(Messenger bot menu) CRUD, webchat CRUD, SMTP integration CRUD,
Messenger/Zalo tag-sync toggling, and a read-only list of Messenger personas
across the workspace's connected Pages. As with every other scope, each
public handler calls the same `packages/business` service method the
private/action code calls — no business logic was duplicated to publish
these.

| Endpoint | Notes |
|---|---|
| `GET/POST /v1/user-persistent-menus`, `GET/PUT/DELETE /v1/user-persistent-menus/{id}` | Full CRUD via `userPersistentMenuService`. |
| `GET/POST /v1/webchats`, `GET/PUT/DELETE /v1/webchats/{id}` | Full CRUD via `integrationWebchatService`. `DELETE` cascades to disconnecting the webchat's `Inbox`. |
| `GET/POST /v1/smtp-integrations`, `GET/PUT/DELETE /v1/smtp-integrations/{id}` | Full CRUD via `integrationSmtpService`. `DELETE` cascades to disconnecting the SMTP `Inbox`. The row's `auth` blob (SMTP password) is never returned — every response is hand-picked to `{id, name, fromAddress}`. |
| `PATCH /v1/messenger-channels/{id}/tag-sync` | Toggles `syncTagEnabledAt` via `messengerIntegrationService.updateTagSync`. |
| `PATCH /v1/zalo-channels/{id}/tag-sync` | Toggles `syncTagEnabledAt` via `zaloIntegrationService.updateTagSync`. |
| `GET /v1/messenger-personas` | Read-only; lists Messenger personas across every Page connected to the workspace, with page access tokens projected away. |

Two invariants specific to this scope:

- **`customCss` is writable by a `channels`-scoped token with no extra
  permission check.** The private `updateWebchatAction` gates `customCss`
  behind `hasWorkspacePermission(..., "superAdmin")` because it renders via
  `dangerouslySetInnerHTML` in `lib/widget-css.tsx`. The public webchat
  `create`/`update` handlers accept it with only workspace-token scope. This
  is **not** a privilege escalation: minting any workspace token already
  requires the caller to be a workspace superAdmin
  (`requireWorkspaceTokenSuperAdmin`), the same reasoning the Ads scope's
  omitted `assertWorkspaceSuperAdmin` guard documents above. Do not add a
  permission check here — there is no lower-privileged caller to check
  against.
- **`welcomeFlowId` normalization and workspace-ownership validation live in
  `integrationWebchatService`, not in either caller.** Both `create` and
  `update` call a shared private helper
  (`resolveWelcomeFlowId`) that normalizes a falsy value to `null` and
  validates the flow belongs to the same workspace via
  `flowService.findActiveById`. This was fixed after a review found the
  public and private paths disagreeing on both points — any future caller
  of `integrationWebchatService.update`/`.create` gets this for free and
  must not re-implement it upstream.

- **Minigames** — this scope shipped in the enum/registry/i18n alongside
  `ads` but, like `ads`, carried no endpoints for a while. It now publishes
  minigame CRUD, enable/disable, per-contact play-history reads, and a
  players (participants) list — its first endpoints. As with every other
  scope, each public handler calls the same `packages/business` service
  method the private/action code calls; no business logic was duplicated to
  publish these.
  - *`GET /v1/minigames/{id}/players` returns contact display PII*
    (`fullName`, `firstName`, `lastName`, `avatar` — no email/phone) with no
    field-level gating, same rationale as the broadcasts-audience note
    above.
  - *`GET /v1/minigames/{id}/plays` is not paged* and is hard-capped at 200
    records by `MAX_PLAY_RECORDS`
    (`packages/business/src/minigame/minigame-contact-service.ts`).
  - *`PUT /v1/minigames/{id}` is a full replace* and passes
    `originalPrizeQuantities: null`, so a token write honors submitted prize
    quantities verbatim — a GET → modify → PUT round-trip discards any prize
    stock decremented by plays that happened in between. `PATCH
    /v1/minigames/{id}` is the safe partial update: only the top-level
    settings objects present in the request body are merged over the current
    row, so omitting `prizeSettings` preserves live stock. Never expose
    `originalPrizeQuantities` on the public request schema.
  - *`POST /v1/minigames/bulk-delete`* deletes multiple minigames by id in
    one call, mirroring `minigameService.deleteMany` (also used by the
    private bulk-delete action).
  - *A duplicate name is a `nameAlreadyExists`/409* from `minigameService`,
    declared on all three write routes (`POST`, `PUT`, `PATCH`) — not the 500
    the raw Postgres unique violation used to produce.

### Ads scope — endpoint-to-scope table

`ads` shipped in the enum/registry/i18n from day one (alongside `channels`,
`minigames`, `appointments`, `media`) but carried no endpoints until this
table's routes were added — a token scoped to `["ads"]` reached nothing
before. It now covers Ads conversion-rule CRUD, the CTWA/CTM/CTID funnel and
CAPI-delivery reads, the conversion export, ad-account reads, and the full
messaging-ad campaign lifecycle (create/retry/publish/pause/delete + video
upload). Every handler below calls the same `packages/business` service
method the corresponding UI action/oRPC procedure calls
(`.agents/rules/data-access.md`).

Two invariants specific to this scope:

- **The campaign-lifecycle mutations deliberately omit
  `assertWorkspaceSuperAdmin`** — present on the private `adsCampaignAPI`
  (`features/ads-campaign/api/private.ts`), it resolves the session user via
  `getCurrentUserAndTargetWorkspace`. A workspace-token request never has a
  session user (the token stack never runs `authMiddleware`), so the private
  guard would throw `errors.superAdminRequired` on every token call. Per the
  auth-flow section above, a workspace token authenticates the workspace,
  not a member, and minting a token already required the caller to be a
  workspace superAdmin — so the guard is correctly absent, not an oversight.
  Any future ads-campaign endpoint copied from the private router must drop
  this guard on the public path, the same way `features/coupons/api/public.ts`
  and the contacts public surface never re-check member-level permissions.
- **`createdBy` is `null`/omitted on every token-created campaign** — a token
  has no associated user, mirroring the `createdById: null` precedent in
  `features/coupons/api/public.ts`. Never resolve it from a session that
  does not exist on this path.

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
  `contacts-import-public-api.test.ts`, `contact-scan-public-api.test.ts`,
  `folders-public-api.test.ts` — handler-behavior tests, one per public-API
  submodule (some under `features/contacts/api/public/`, some in the owning
  sibling feature's own `api/public.ts`)
- `apps/builder/__tests__/ads-public-scope.test.ts` — real-router scope
  wiring for both `features/ads/api/public.ts` and
  `features/ads-campaign/api/public.ts` (merged into one `ads` router)
- `apps/builder/__tests__/ads-public-api.test.ts`,
  `ads-campaign-public-api.test.ts` — handler-behavior tests; the latter
  asserts a campaign mutation succeeds with no session user in context (the
  `assertWorkspaceSuperAdmin` regression guard) and that `createdBy` is never
  set from one
- `apps/builder/__tests__/create-workspace-token-action.test.ts`
- `apps/builder/__tests__/delete-workspace-token-action.test.ts`
- `apps/builder/__tests__/integration-api-token-hash.test.ts`
- `packages/business/__tests__/workspace-api-token.service.test.ts`
- `packages/business/__tests__/ads-conversion-rule.service.test.ts`
  (`findOrFail`)
- `packages/variables/__tests__/system-fields.test.ts` (`{{api_key}}`)
