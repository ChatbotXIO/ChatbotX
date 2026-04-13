---
name: integration-channel
description: >-
  Create and modify integration channels (messenger, whatsapp, zalo, webchat,
  etc.) for the chatbot platform. Use when adding a new channel integration,
  modifying webhook handlers, working with message send/receive, or connecting
  external platforms.
---

# Integration Channel Development

## Architecture Overview

Integrations are standalone packages under `integrations/` that implement the `IntegrationDefinition` contract from `@chatbotx.io/sdk`.

**Flow:** External platform → webhook → builder route → BullMQ queue → worker → integration handler

## Pre-Creation Confirmation (MANDATORY)

Before writing any code, you **MUST** resolve the 3 questions below. Analyze the user's request first, ask only what's missing, then present a confirmation summary and wait.

### Question 1: Integration name

Channel name → determines package name (`@chatbotx.io/integration-<channel>`), DB table (`Integration<Channel>`), all file paths.

### Question 2: Auth fields

| Base | When to use | Examples |
|------|-------------|---------|
| `customAuthSchema` (from SDK) | User provides credentials directly. No OAuth. | email, webchat |
| `Oauth2AuthValue` (from SDK) | Platform uses OAuth2 with clientId/clientSecret + tokens. | messenger, whatsapp, zalo |

For EACH field: name, Zod type, required or optional. Infer types from context (e.g. "port" → `z.number().int().positive()`).

### Question 3: Organization settings

| Scenario | Org settings? | Examples |
|----------|--------------|---------|
| OAuth app (clientId/clientSecret shared across workspaces) | YES | messenger, whatsapp, zalo |
| Per-workspace credentials only | NO | email, webchat, smtp |
| Shared third-party API key | YES | giphy, stripe |

### Confirmation Summary

```
Integration: <channel>
Auth type: custom / oauth2
Auth fields:
  - fieldA: z.string().min(1)        [required]
  - fieldB: z.number().int()          [required]
Organization settings: YES / NO
```

Wait for user confirmation before proceeding.

---

## Creating a New Integration — Execution Plan

After confirmation, execute these 4 phases **in order**. Each phase ends with a verification step.

### Phase 1: Integration Package (create `integrations/<channel>/`)

Create 5 files. All are boilerplate — write them in a single batch.

**Directory structure:**
```
integrations/<channel>/
  package.json
  tsconfig.json
  src/
    index.ts
    schema.ts
    integration.ts
    handlers/
      webhook.ts
```

**`package.json`:**
```json
{
  "name": "@chatbotx.io/integration-<channel>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./**/*": "./src/**/*.ts"
  },
  "dependencies": {
    "@chatbotx.io/sdk": "workspace:*",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@chatbotx.io/typescript-config": "workspace:*",
    "@types/node": "^24.10.4",
    "typescript": "6.0.2"
  }
}
```

**`tsconfig.json`:**
```json
{
  "extends": "@chatbotx.io/typescript-config/base.json",
  "include": ["src/**/*.ts"],
  "compilerOptions": { "strictNullChecks": true }
}
```

**`src/index.ts`:**
```typescript
export * from "./integration"
```

**`src/schema.ts`** — fill in auth fields from confirmation:
```typescript
import type { BaseConfig } from "@chatbotx.io/sdk"
import { customAuthSchema } from "@chatbotx.io/sdk"
import { z } from "zod"

export type <Channel>Config = BaseConfig

export const <channel>AuthSchema = customAuthSchema.extend({
  // confirmed auth fields here
})
export type <Channel>AuthValue = z.infer<typeof <channel>AuthSchema>

export type <Channel>Actions = Record<string, never>
```

**`src/integration.ts`:**
```typescript
import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import { webhookHandler } from "./handlers/webhook"
import type { <Channel>Actions, <Channel>AuthValue } from "./schema"

const config: IntegrationDefinition<BaseConfig, <Channel>AuthValue, <Channel>Actions> = {
  name: "<channel>",
  channels: { channel: { message: {} } },
  actions: {},
  async handleRequest(props: HandleRequestProps<BaseConfig>): Promise<string | number | Oauth2AuthValue> {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()
    switch (action) {
      case "webhook":
        return await webhookHandler(props)
      default:
        throw new Error(`Not implemented: ${props.req.method} ${props.req.url}`)
    }
  },
  disconnect(_props: <Channel>AuthValue): Promise<void> {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration(config)
```

**`src/handlers/webhook.ts`:**
```typescript
import type { HandleRequestProps } from "@chatbotx.io/sdk"
import type { <Channel>Config } from "../schema"

export const webhookHandler = async (props: HandleRequestProps<<Channel>Config>) => {
  const payload = await props.req.json()
  await props.queue?.add("incomingMessage", {
    type: "incomingMessage",
    data: {
      integrationType: "<channel>",
      integrationIdentifier: payload.identifier,
      payload,
    },
  })
  return "OK"
}
```

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

| # | File | Edit |
|---|------|------|
| 1 | `packages/database/src/partials/channel.ts` | Add `"<channel>"` to `channelTypes` z.enum array |
| 2 | `packages/database/src/partials/integration.ts` | Add `"<channel>"` to `integrationTypes` z.enum array |
| 3 | `packages/database/src/schema/index.ts` | Add `export * from "./integration-<channel>"` |
| 4 | `packages/database/src/relations/index.ts` | Add import at top AND spread in `relations` object |
| 5 | `packages/database/src/types.ts` | Add `export type Integration<Channel>Model = typeof schema.integration<Channel>Model.$inferSelect` |

**CRITICAL — `relations/index.ts` needs TWO edits:**
1. Import: `import { integration<Channel>Relations } from "./integration-<channel>"`
2. Spread: `...integration<Channel>Relations,` in the relations object

After editing, immediately read back each file to verify both import AND spread are present.

### Phase 3: Registration (edit 6 files)

**Integration registration (4 files, single batch):**

| # | File | Edit |
|---|------|------|
| 1 | `apps/builder/src/integration.ts` | Add `import { integration as integration<Channel> } from "@chatbotx.io/integration-<channel>"` AND `<channel>: integration<Channel>` in object |
| 2 | `apps/worker/src/services/integrations.ts` | Add `import ...` AND `<channel>: integration<Channel>` in `allIntegrations` |
| 3 | `apps/builder/package.json` | Add `"@chatbotx.io/integration-<channel>": "workspace:*"` to dependencies |
| 4 | `apps/worker/package.json` | Add `"@chatbotx.io/integration-<channel>": "workspace:*"` to dependencies |

**CRITICAL — verify imports:** After each StrReplace on `integration.ts` and `integrations.ts`, immediately read back lines 1-10 to confirm the import line is actually present. The `import` and the usage are TWO separate edits.

**UI registration (2 files):**

| # | File | Edit |
|---|------|------|
| 5 | `apps/builder/src/features/inboxes/components/inbox-icon.tsx` | Add icon to lucide import AND entry in `INBOX_ICON_CONFIG` |
| 6 | `apps/builder/src/features/inboxes/components/inbox-card-list.tsx` | Add `<channel>: undefined` to `cardConfigs` |

**CRITICAL — `ChannelType` cascade:** Adding a value to the `channelTypes` enum causes compile errors in every `Record<ChannelType, ...>` that doesn't include the new key. Grep for `Record<ChannelType` and `Record<\n\s*ChannelType` (multiline) to find and fix ALL hits.

**Phase 3 checkpoint:** Run `ReadLints` on all modified files. Fix any undeclared variable or missing import errors before continuing.

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
- Uses `workspaceActionClient.bindArgsSchemas(workspaceIdrequestParams).inputSchema(schema).action(...)`
- Creates `Inbox` + `Integration<Channel>` in a DB transaction
- The inbox `channel` value must match the enum value added in Phase 2: `channelTypes.enum.<channel>`
- The inbox `name` should be set from `parsedInput.name`
- All auth fields go into the `auth` JSONB column

**`actions/delete-<channel>.action.ts`** — Delete action pattern:
- Uses `workspaceActionClient.bindArgsSchemas([zodBigintAsString(), zodBigintAsString()]).action(...)`
- **No `.inputSchema()`** — delete has no input
- Disconnect component calls `execute()` with NO arguments (not `execute({})`)

**`queries/index.ts`** — Server-side queries:
```typescript
"use server"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { integration<Channel>Model } from "@chatbotx.io/database/schema"
import type { Integration<Channel>Model } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listIntegration<Channel>s = async (input: { workspaceId: string }) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const data = await db.query.integration<Channel>Model.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "desc" },
  })
  return { data }
}
```

**`components/create-<channel>-form.tsx`** — Form pattern:
- Uses `useHookFormAction(createAction.bind(null, workspaceId), zodResolver(schema), ...)`
- **CRITICAL:** Must call `.bind(null, workspaceId)` because the action uses `bindArgsSchemas`

**`components/<channel>-disconnect.tsx`** — Disconnect pattern:
- Uses `useAction(deleteAction.bind(null, workspaceId, integrationId), ...)`
- Calls `execute()` with NO arguments

**`<channel>-manage.tsx`** — Manage table:
- Uses `use(promises)` to unwrap server promises
- Shows table with integration data
- Add button links to `/channels/create?channel=<channel>&workspaceId=...`

**Settings page — create `@<channel>/page.tsx`:**
```typescript
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { <Channel>Manage } from "@/features/integration-<channel>/<channel>-manage"
import { listIntegration<Channel>s } from "@/features/integration-<channel>/queries"

export default async function SettingChannel<Channel>Page(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) return notFound()
  const promises = listIntegration<Channel>s({ workspaceId })
  return <<Channel>Manage promises={promises} workspaceId={workspaceId} />
}
```

**Settings layout — edit `layout.tsx`:**
Add `"<channel>"` to the `CHANNELS` array. That's the only edit needed — the type and props are derived automatically from the array.

## Post-Creation Verification

Run these checks **in order**:

1. **`ReadLints`** on ALL modified files
2. **`pnpm fix`** — auto-fix formatting (ignore pre-existing errors in other files)
3. **`CI=true pnpm install --no-frozen-lockfile`** — link new workspace package (use `CI=true` to avoid TTY prompt)
4. **`pnpm turbo build`** — if it fails, read errors, fix, re-run

### Common Build Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module '@chatbotx.io/integration-<channel>'` | Package not linked | Run `pnpm install --no-frozen-lockfile` |
| `Property '<channel>' is missing in type ... Record<ChannelType, ...>` | Enum value added but not all Records updated | Grep `Record<ChannelType` and add missing entry |
| `The ... variable is undeclared` | Import missing | Read back file to verify import line exists, re-add if missing |
| `Target signature provides too few arguments` | Action uses `bindArgsSchemas` but form didn't `.bind()` | Use `action.bind(null, workspaceId)` in useHookFormAction |
| `Type 'string' is not assignable to type ChannelType` | Passing untyped string to InboxIcon | Cast with `as ChannelType` and add import |
| `Argument of type '{}' ... parameter of type 'void'` | Calling `execute({})` on no-input action | Use `execute()` with no arguments |

## Organization Settings (only if needed)

If org settings ARE needed, also update:

| # | File | What to add |
|---|------|-------------|
| 1 | `packages/database/src/partials/organization.ts` | New `<channel>SettingsSchema` + add to `organizationSettingsSchema` |
| 2 | `apps/builder/src/enterprise/features/organization-settings/` | Settings panel component + action |
| 3 | `manage-organization-settings.tsx` | Import and render new panel |
| 4 | `<channel>-manage.tsx` | Gate "Add" button on `organizationSettings.<channel>` |

## Webhook Flow

1. External platform sends webhook to `/integrations/<channel>/webhook`
2. Builder route resolves integration config
3. `handleRequest` receives `{ config, req, queue }`
4. Handler enqueues job: `queue.add("incomingMessage", { type, data })`
5. Integration worker calls `allIntegrations[type].channels.channel.message.receiveMessage`

## Existing Integrations Reference

| Integration | Auth type | Org settings? | Notes |
|-------------|-----------|---------------|-------|
| messenger | OAuth2 | YES | clientId/clientSecret in org |
| whatsapp | OAuth2 | YES | clientId/clientSecret + systemUser in org |
| zalo | OAuth2 | YES | clientId/clientSecret in org |
| google-sheets | OAuth2 | YES | clientId/clientSecret in org |
| email | Custom | NO | SMTP credentials per workspace |
| smtp | Custom | NO | SMTP with provider presets |
| webchat | Custom | NO | PartySocket-based |
| chatbotx | Custom | NO | Internal chatbot |
