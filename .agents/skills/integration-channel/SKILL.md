---
name: integration-channel
description: >-
  Create and modify integration channels (messenger, whatsapp, zalo, tiktok, webchat,
  etc.) for the chatbot platform. Use when adding a new channel integration,
  modifying webhook handlers, working with message send/receive, or connecting
  external platforms.
---

# Integration Channel Development

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pre-Creation Confirmation](#pre-creation-confirmation-mandatory) — resolve name, auth type, platform credentials before coding
3. [Phase 1: Integration Package](#phase-1-integration-package) — create `integrations/<channel>/`
4. [Phase 2: Database](#phase-2-database) — schema + register in 7 files
5. [Phase 3: Registration](#phase-3-registration) — builder, worker, UI
6. [Phase 4: Builder Feature](#phase-4-builder-feature--settings-page) — settings page + feature directory
7. [Post-Creation Verification](#post-creation-verification) — lint, install, build
8. [Platform Credentials](#platform-credentials-only-if-needed) — optional OAuth app credentials
9. [Webhook Flow](#webhook-flow)
10. [Multi-Account Pickers](#multi-account-pickers)
11. [Existing Integrations Reference](#existing-integrations-reference)

---

## Architecture Overview

Integrations are standalone packages under `integrations/` that implement the `IntegrationDefinition` contract from `@chatbotx.io/sdk`.

**Flow:** External platform → webhook → builder route → BullMQ queue → worker → integration handler

## Pre-Creation Confirmation (MANDATORY)

Before writing any code, you **MUST** resolve the 3 questions below. Analyze the user's request first, ask only what's missing, then present a confirmation summary and wait.

### Question 1: Integration name

Channel name → determines package name (`@chatbotx.io/integration-<channel>`), DB table (`Integration<Channel>`), all file paths.

### Question 2: Auth fields

| Base                          | When to use                                               | Examples                          |
| ----------------------------- | --------------------------------------------------------- | --------------------------------- |
| `customAuthSchema` (from SDK) | User provides credentials directly. No OAuth.             | smtp, webchat, telegram           |
| `Oauth2AuthValue` (from SDK)  | Platform uses OAuth2 with clientId/clientSecret + tokens. | messenger, whatsapp, zalo, tiktok |

For EACH field: name, Zod type, required or optional. Infer types from context (e.g. "port" → `z.number().int().positive()`).

### Question 3: Platform credentials

| Scenario                                                   | Platform credentials? | Examples                          |
| ---------------------------------------------------------- | --------------------- | --------------------------------- |
| OAuth app (clientId/clientSecret shared across workspaces) | YES                   | messenger, whatsapp, zalo, tiktok |
| Per-workspace credentials only                             | NO                    | smtp, webchat, telegram           |
| Shared third-party API key                                 | YES                   | giphy, stripe                     |

### Confirmation Summary

```
Integration: <channel>
Auth type: custom / oauth2
Auth fields:
  - fieldA: z.string().min(1)        [required]
  - fieldB: z.number().int()          [required]
Platform credentials: YES / NO
```

Wait for user confirmation before proceeding.

---

## Creating a New Integration — Execution Plan

After confirmation, execute these 4 phases **in order**. Each phase ends with a verification step.

### Phase 1: Integration Package (create `integrations/<channel>/`)

**Copy `integrations/telegram/`** — a live, minimal `customAuthSchema` integration. Copying a
sibling keeps dependency versions and the `exports`/`scripts` blocks correct; a hand-written
template drifts on every bump.

```bash
cp -r integrations/telegram integrations/<channel>
```

Then rename throughout and strip Telegram-specific logic. The five files that matter:

| File | What to change |
|---|---|
| `package.json` | `name` → `@chatbotx.io/integration-<channel>`. Keep the `exports` and `scripts` blocks as-is. Drop deps the new channel doesn't use. |
| `tsconfig.json` | Nothing — it just extends `@chatbotx.io/typescript-config/base.json`. |
| `src/index.ts` | Nothing — re-exports `./integration`. |
| `src/schema.ts` | `<channel>AuthSchema` — extend `customAuthSchema` (SDK) with the auth fields from the confirmation step, or use `Oauth2AuthValue` for OAuth channels. Export `<Channel>Config`, `<Channel>AuthValue`, `<Channel>Actions`. |
| `src/integration.ts` | `name: "<channel>"`, the `channels`/`actions` maps, and the `handleRequest` switch that routes the URL's last path segment (`case "webhook"`) to your handler. Implement `disconnect` if the platform supports it. |
| `src/handlers/webhook.ts` | Parse the platform's payload and `props.queue?.add("incomingMessage", { type: "incomingMessage", data: { integrationType: "<channel>", integrationIdentifier, payload } })`. |

The `Integration` class and `customAuthSchema` come from `@chatbotx.io/sdk`
(`packages/sdk/src/lib/integration.ts`, `packages/sdk/src/lib/auth/index.ts`).

### Phase 2: Database (create schema + register in 7 files)

Create 2 new files, edit 5 existing files. Do all edits in a single batch.

**Create `packages/database/src/schema/integration-<channel>.ts`:**

```typescript
import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integration<Channel>Model = pgTable(
  "Integration<Channel>",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    name: text().notNull(),
    workspaceId: bigintAsString().notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
    inboxId: bigintAsString().notNull()
      .references(() => inboxModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    index("Integration<Channel>_workspaceId_idx").using("btree", table.workspaceId.asc().nullsLast()),
    uniqueIndex("Integration<Channel>_inboxId_key").using("btree", table.inboxId.asc().nullsLast()),
  ],
)
```

**Create `packages/database/src/relations/integration-<channel>.ts`:**

```typescript
import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integration<Channel>Relations = defineRelationsPart(schema, (r) => ({
  integration<Channel>Model: {
    workspace: r.one.workspaceModel({
      from: r.integration<Channel>Model.workspaceId, to: r.workspaceModel.id, optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integration<Channel>Model.inboxId, to: r.inboxModel.id, optional: false,
    }),
  },
}))
```

**Edit 5 registration files (all in one batch):**

| #   | File                                            | Edit                                                                                               |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `packages/utils/src/channel.ts`                 | Add `"<channel>"` to the `channelTypes` z.enum. **Defined here**, not in `database/partials/channel.ts` (that file only re-exports it, so `flow-config` can depend on it without the database layer) |
| 2   | `packages/database/src/partials/integration.ts` | Add `"<channel>"` to `integrationTypes` z.enum array                                               |
| 3   | `packages/database/src/schema/index.ts`         | Add `export * from "./integration-<channel>"`                                                      |
| 4   | `packages/database/src/relations/index.ts`      | Add import at top AND spread in `relations` object                                                 |
| 5   | `packages/database/src/types.ts`                | Add `export type Integration<Channel>Model = typeof schema.integration<Channel>Model.$inferSelect` |

**CRITICAL — `relations/index.ts` needs TWO edits:**

1. Import: `import { integration<Channel>Relations } from "./integration-<channel>"`
2. Spread: `...integration<Channel>Relations,` in the relations object

After editing, immediately read back each file to verify both import AND spread are present.

### Phase 3: Registration (edit 7 files)

**Integration registration (4 files, single batch):**

| #   | File                                       | Edit                                                                                                                                           |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/builder/src/integration.ts`          | Add `import { integration as integration<Channel> } from "@chatbotx.io/integration-<channel>"` AND `<channel>: integration<Channel>` in object |
| 2   | `apps/worker/src/services/integrations.ts` | Add `import ...` AND `<channel>: integration<Channel>` in `allIntegrations`                                                                    |
| 3   | `apps/builder/package.json`                | Add `"@chatbotx.io/integration-<channel>": "workspace:*"` to dependencies                                                                      |
| 4   | `apps/worker/package.json`                 | Add `"@chatbotx.io/integration-<channel>": "workspace:*"` to dependencies                                                                      |

**CRITICAL — verify imports:** After each StrReplace on `integration.ts` and `integrations.ts`, immediately read back lines 1-10 to confirm the import line is actually present. The `import` and the usage are TWO separate edits.

**UI registration (3 files):**

| #   | File                                                               | Edit                                                                                                             |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 5   | `apps/builder/src/features/inboxes/components/inbox-icon.tsx`      | Add icon to lucide import AND entry in `INBOX_ICON_CONFIG`                                                       |
| 6   | `apps/builder/src/features/inboxes/components/inbox-card-list.tsx` | Add `<channel>: undefined` to `cardConfigs`                                                                      |
| 7   | `packages/utils/src/channel.ts`                                    | Add `CHANNEL_CAPABILITIES` entry (`creatable`, `manageable`, `requiresCredential`, `order`) — `CREATABLE_CHANNELS`/`MANAGEABLE_CHANNELS` derive from it, so the create picker and the settings accordion row appear automatically |

**CRITICAL — `ChannelType` cascade:** Adding a value to the `channelTypes` enum causes compile errors in every `Record<ChannelType, ...>` that doesn't include the new key. Grep for `Record<ChannelType` and `Record<\n\s*ChannelType` (multiline) to find and fix ALL hits.

**Phase 3 checkpoint:** Run `pnpm lint` and `pnpm --filter <touched-workspace> check-types` on the modified files. Fix any undeclared-variable or missing-import errors before continuing.

### Phase 4: Builder Feature + Settings Page

Create the feature directory and settings page. This is standard feature-scaffold work.

**Directory structure:**

```
apps/builder/src/features/integration-<channel>/
  schema/
    mutation.ts
    resource.ts
  actions/
    create-<channel>.action.ts
    update-<channel>.action.ts
    delete-<channel>.action.ts
  queries/
    index.ts
  components/
    create-<channel>-form.tsx
    <channel>-disconnect.tsx
  <channel>-manage.tsx
```

**Key patterns for integration features:**

**`schema/mutation.ts`** — Zod schemas for create/update:

```typescript
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const create<Channel>Request = z.object({
  name: z.string().min(1).max(40),
  workspaceId: zodBigintAsString().nullish(),
  // auth fields from confirmation
})
export type Create<Channel>Request = z.infer<typeof create<Channel>Request>

export const update<Channel>Request = create<Channel>Request.partial()
export type Update<Channel>Request = z.infer<typeof update<Channel>Request>
```

**`schema/resource.ts`** — Select schema for responses:

```typescript
import { createSelectSchema, integration<Channel>Model } from "@chatbotx.io/database/schema"
import type { z } from "zod"

export const integration<Channel>Resource = createSelectSchema(integration<Channel>Model).pick({
  id: true,
  name: true,
})
export type Integration<Channel>Resource = z.infer<typeof integration<Channel>Resource>
```

**`actions/create-<channel>.action.ts`** — Create action pattern:

- Uses `workspaceActionClient.bindArgsSchemas(workspaceIdAndIdRequestParams).inputSchema(schema).action(...)` — see `apps/builder/src/features/integration-telegram/actions/disconnect.action.ts:17`
- Creates `Inbox` + `Integration<Channel>` in a DB transaction
- The inbox `channel` value must match the enum value added in Phase 2: `channelTypes.enum.<channel>`
- The inbox `name` should be set from `parsedInput.name`
- All auth fields go into the `auth` JSONB column

**`actions/delete-<channel>.action.ts`** — Delete action pattern:

- Uses `workspaceActionClient.bindArgsSchemas([zodBigintAsString(), zodBigintAsString()]).action(...)`
- **No `.inputSchema()`** — delete has no input
- Calls `integration<Channel>Service.delete({ workspaceId, id })` — the service (not the action) owns the transaction, deletes the integration row, and calls `inboxService.disconnect({ inboxId, tx })` inside it. The action never opens its own `db.transaction(...)`.
- **CRITICAL:** Every channel delete service method must call `inboxService.disconnect()` inside the same transaction as the integration-row delete. This keeps disconnected inboxes out of active inbox queries and prevents channel-specific drift.

**`queries/index.ts`** — A thin adapter over the service, per
`.agents/rules/data-access.md`: resolve session context → plain params → call the service →
shape the response. **No `db` / `@chatbotx.io/database/schema` import, and no `"use server"`**
(a query file is not a server-action module).

```typescript
import { integration<Channel>Service } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listIntegration<Channel>s = async (input: { workspaceId: string }) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return { data: await integration<Channel>Service.listByWorkspaceId(input.workspaceId) }
}
```

> **Do not copy a sibling channel's `queries/index.ts` verbatim.** Every existing channel
> feature (e.g. `apps/builder/src/features/integration-telegram/queries/index.ts`) still opens
> with `import { db } from "@chatbotx.io/database/client"` — those are legacy exceptions that
> predate the rule, not the pattern. New code calls a service.

**`components/create-<channel>-form.tsx`** — Form pattern:

- Uses `useHookFormAction(createAction.bind(null, workspaceId), zodResolver(schema), ...)`
- **CRITICAL:** Must call `.bind(null, workspaceId)` because the action uses `bindArgsSchemas`

**`components/<channel>-disconnect.tsx`** — Disconnect pattern:

- Renders `<DisconnectIntegrationDialog>` from `@/features/common/components/disconnect-integration-dialog`
- Passes `featureLabel`, `open`, `onOpenChange`, `isPending`, and `onConfirm` to the shared dialog
- Binds the action with `useAction(deleteAction.bind(null, workspaceId, integrationId), ...)` and calls `execute()` with NO arguments

**`<channel>-manage.tsx`** — Manage table:

- Uses `use(promises)` to unwrap server promises
- Shows table with integration data
- Add button links to `/channels/create?channel=<channel>&workspaceId=...`

**Settings page — create `settings/channels/<channel>/page.tsx`:**

Each channel's settings panel is a real nested route
(`apps/builder/src/app/space/[workspaceId]/(settings)/settings/channels/<channel>/page.tsx`),
not a parallel-route slot. The accordion rows render in `layout.tsx` (from
`MANAGEABLE_CHANNELS` filtered by visibility policy); opening a row navigates
to this route so only this channel's server/client graph loads. Guard the page
with `requireVisibleChannel` — it 404s for hidden channels and returns the
request-scoped `ChannelPolicy`:

```typescript
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { <Channel>Manage } from "@/features/integration-<channel>/<channel>-manage"
import { listIntegration<Channel>s } from "@/features/integration-<channel>/queries"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannel<Channel>Page(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) return notFound()

  await requireVisibleChannel(workspaceId, "<channel>")

  const promises = listIntegration<Channel>s({ workspaceId })
  const canCreate = await resolveChannelCreatable(workspaceId, "<channel>")
  return <<Channel>Manage canCreate={canCreate} promises={promises} workspaceId={workspaceId} />
}
```

For credential-backed channels, keep the policy the guard returns — its
`ownerId` is the tenant-aware owner, so no extra workspace/owner fetch:

```typescript
const policy = await requireVisibleChannel(workspaceId, "<channel>")
const credential = await platformCredentialService.resolveForOwner({
  ownerId: policy.ownerId,
  type: "<channel>",
})
```

No settings-layout edit is needed: the row appears once the
`CHANNEL_CAPABILITIES` entry marks the channel `manageable` (Phase 3, file 7).
A capability entry without this page 404s loudly when the row is clicked.

## Post-Creation Verification

Run these checks **in order**:

1. **`CI=true pnpm install --no-frozen-lockfile`** — link the new workspace package (`CI=true` avoids the TTY prompt)
2. **`pnpm fix`** then **`pnpm lint`** — auto-fix formatting, then confirm clean (ignore pre-existing errors in untouched files)
3. **`pnpm turbo build`** — if it fails, read errors, fix, re-run

### Common Build Errors

| Error                                                                  | Cause                                                   | Fix                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `Cannot find module '@chatbotx.io/integration-<channel>'`              | Package not linked                                      | Run `pnpm install --no-frozen-lockfile`                        |
| `Property '<channel>' is missing in type ... Record<ChannelType, ...>` | Enum value added but not all Records updated            | Grep `Record<ChannelType` and add missing entry                |
| `The ... variable is undeclared`                                       | Import missing                                          | Read back file to verify import line exists, re-add if missing |
| `Target signature provides too few arguments`                          | Action uses `bindArgsSchemas` but form didn't `.bind()` | Use `action.bind(null, workspaceId)` in useHookFormAction      |
| `Type 'string' is not assignable to type ChannelType`                  | Passing untyped string to InboxIcon                     | Cast with `as ChannelType` and add import                      |
| `Argument of type '{}' ... parameter of type 'void'`                   | Calling `execute({})` on no-input action                | Use `execute()` with no arguments                              |

## Platform Credentials (only if needed)

If platform credentials ARE needed, also update:

| #   | File                                           | What to add                                                                                                                       |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/database/src/partials/credential.ts` | New `<channel>CredentialSchema` + add to `platformCredentialSchema`                                                               |
| 2   | `apps/builder/src/features/platform-credentials/` | Settings panel component + action                                                                                                 |
| 3   | `manage-platform-credentials.tsx`                 | Import and render new panel                                                                                                       |
| 4   | `<channel>-manage.tsx`                         | Gate "Add" button on presence of a verified credential via `platformCredentialService.findForUser({ userId, type: '<channel>' })` |

## Logging

Use the structured logger, never `console`, and log with `{ err: error }` — see repo
invariant 20 in `AGENTS.md`.

## Comment Handler Pattern

Some integrations (messenger, instagram-facebook) expose a `comment` channel alongside `message`. The structure mirrors `message` handlers:

```
handlers/
  comment/
    index.ts                    ← exports commentHandlers object
    actions.ts                  ← deleteComment, hideComment, likeComment, editComment
    outgoing-comment/
      index.ts                  ← sendComment
```

**`index.ts`:**

```typescript
import { deleteComment, editComment, hideComment, likeComment } from "./actions"
import { sendComment } from "./outgoing-comment"

export const commentHandlers = {
  sendComment,
  editComment,
  deleteComment,
  likeComment,
  hideComment,
}
```

**`actions.ts`** — wrap API calls, catch errors, re-throw as `mapToChannelError(error)`.

**`sendComment`** — requires `message.contentAttributes.replyToCommentId` (string); throw `ChannelError(PAYLOAD_INVALID)` if missing.

**`editComment`** — if the platform does not support editing comments (e.g. Facebook/Instagram), resolve immediately with no-op and log a warning.

**Webhook routing** — comment events arrive as `changes` entries with `field === "comments"`. Parse with a typed Zod schema, then `queue.add("incomingComment", { type: "incomingComment", data: { commentData: {...} } })`.

## Webhook Flow

1. External platform sends webhook to `/integrations/<channel>/webhook`
2. Builder route resolves integration config
3. `handleRequest` receives `{ config, req, queue }`
4. Handler enqueues job: `queue.add("incomingMessage", { type, data })`
5. Integration worker calls `allIntegrations[type].channels.channel.message.receiveMessage`

### White-label: register webhook URLs on the broker host

When white-label custom domains are in use, webhook URLs registered with the provider
(and any URL shown in a platform-credential settings card for the reseller to copy) must
use the **broker host** — `getBrokerOrigin()` / `buildBrokerCallbackUrl()`
(`apps/builder/src/lib/oauth-broker.ts`) — not the tenant's custom domain. Providers that
validate the registered host (e.g. WhatsApp/Meta, TikTok) cannot reach an unregistered
branded domain, so a webhook on the reseller domain silently fails. See
`features/integration-whatsapp/actions/webhook-url.ts` and `docs/tenancy.md`
(provider-console registration runbook).

## Multi-Account Pickers

Channels whose provider returns a list of connectable accounts — Messenger
pages, Instagram-via-Facebook accounts, WhatsApp phone numbers — share one
implementation instead of each building its own picker:
`apps/builder/src/features/channel-connect/` (`ConnectSelectionForm` +
`useConnectFlow` + `ConnectManyDialog` + `CoexistStep`).

- **Single-account server core + oRPC route** — one plain server function per
  provider id (e.g. `actions/connect-page.ts`'s `connectMessengerPage`),
  returning `ConnectActionResult<TOutcome>` (`{ kind: "outcome", outcome }` or
  `{ kind: "sessionError", code }`) — never a thrown exception the client has
  to classify, and never a 500 (the route would be unclassifiable). Build the
  three outcome literals with `lib/connect-action-outcomes.ts`'s
  `notSelectableOutcome` / `duplicatedOutcome` / `connectedOutcome`, wrap
  best-effort follow-ups (branding, tag scan, …) in `runConnectFollowUps`,
  and convert the core's outer catch with `toConnectActionFailure`. Expose it
  as `POST /api/channels/<channel>/connect` from the feature's `api/`
  folder (`authorizedAPI`, ids-only input, registered through the feature's
  `api/index.ts`) — **not** a server action: Next serializes server actions
  from one browser, so the picker's batch could only connect one account at a
  time. Add a server action only for a form that genuinely needs one (as
  WhatsApp's top-level connect form does), delegating to the same core.
- **`resolveConnectSession`** (`lib/resolve-connect-session.ts`) — reads the
  pending-auth cookie or signup session for both legs (initial provider list
  fetch and the per-id connect call); returns the same session-error codes
  the outcome wire type carries.
- **Client side** — every picker posts through `lib/connect-client.ts`'s
  `connectViaApi` (path from `CONNECT_CHANNEL_REGISTRY[channel].connectPath`),
  which turns any transport failure into the batch's own `failed`/`unknown`
  outcome. `useConnectFlow` runs a single pick inline (button spinner) and
  fans 2+ picks out through `ConnectManyDialog`'s status list,
  `CONNECT_CONCURRENCY` at a time.
  On a coexist-eligible channel (`isCoexistChannel`,
  `packages/utils/channel.ts`) the "sync existing history" opt-in is a
  **per-row switch in the picker** (`CoexistRowSwitch` /
  `CoexistOptionsPanel`), not a step: each row's call runs right after that
  row connects, via `lib/coexist-client.ts`'s `setCoexist`
  (`useConnectBatch`'s `afterConnect` for a batch, inline in `useConnectFlow`
  for a single pick). A channel with its own picker form gets the same rule
  by calling `hooks/use-coexist-selection.tsx`'s `useCoexistSelection` —
  don't re-derive `coexistIds ⊆ selectedIds` by hand. The dialog's Continue
  skips every channel extra step on the session errors in
  `SESSION_ERRORS_SKIPPING_EXTRA_STEPS` (`lib/row-status.ts`), whose routes
  `workspaceAuthorizedMidddleware` would deny anyway.
  `CoexistStep`/`CoexistPopup` survive only for WhatsApp's
  manual/auto-select direct path.
- **New channel registration** — add one entry to
  `lib/registry.ts`'s `CONNECT_CHANNEL_REGISTRY`, typed
  `satisfies Record<ConnectPickerChannel, ConnectChannelConfig>` so a missing
  channel fails to compile. That file is the only place in
  `channel-connect` allowed to hard-code a channel name.
- **Row/warning copy** — `lib/row-status.ts` (`ROW_STATUS`,
  `REASON_MESSAGE_KEYS`, `WARNING_MESSAGE_KEYS`,
  `SESSION_ERROR_MESSAGE_KEYS`) is the single source of i18n keys for every
  row state, failure reason, and outcome warning shown in the dialog — reuse
  these, don't add a channel-local copy of the same labels.

## Existing Integrations Reference

**Channel vs integration.** Not every integration is a channel. `channelTypes`
(`packages/utils/src/channel.ts:18`) is exactly: `omnichannel`, `webchat`, `messenger`,
`whatsapp`, `zalo`, `smtp`, `telegram`, `instagram`, `tiktok`, `api`. Entries below that are
not in that list (`google-sheets`, `instagram-facebook`, …) are `integrationTypes` only —
they connect an external service but carry no inbox conversation.


| Integration         | Auth type | Platform credentials? | Notes                                                                                                                              |
| ------------------- | --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| messenger           | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| whatsapp            | OAuth2    | YES                   | clientId/clientSecret + systemUser as platform credential                                                                          |
| zalo                | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| tiktok              | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| google-sheets       | OAuth2    | YES                   | clientId/clientSecret as platform credential                                                                                       |
| instagram-facebook  | OAuth2    | YES                   | Meta/Facebook app (clientId/clientSecret); auth via Facebook Graph API for Instagram Business/Creator accounts linked to FB Pages; handles DMs + post comments; Personal accounts filtered out; integration name in code: `instagramFacebook` |
| smtp                | Custom    | NO                    | SMTP with provider presets                                                                                                         |
| webchat             | Custom    | NO                    | PartySocket-based                                                                                                                  |
| chatbotx            | Custom    | NO                    | Internal chatbot                                                                                                                   |
