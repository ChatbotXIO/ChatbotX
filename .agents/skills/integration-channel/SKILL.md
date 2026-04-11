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

## Integration Contract

Defined in `packages/sdk/src/lib/integration.ts`:

```typescript
type IntegrationDefinition<IConfig, IAuth, IActions> = {
  name: string
  channels?: {
    channel: {
      message?: MessageHandlers<IAuth>     // sendMessage, receiveMessage, sendFlowStep
      conversation?: ConversationHandlers   // createConversation, resolveConversation
      contact?: ContactHandlers             // createContact, updateContact
    }
  }
  actions: IActions
  handleRequest: Handler<HandleRequestProps<IConfig>, ...>
  disconnect: Handler<IAuth, void>
}
```

### Handler Types

- **`receiveMessage`**: Parse incoming webhook → `ReceivedMessageResult`
- **`sendMessage`**: Send outgoing message to platform (text, image, etc.)
- **`sendFlowStep`**: Send flow step content (buttons, cards, etc.)
- **`handleRequest`**: HTTP webhook/callback handler

## Creating a New Integration — Full Checklist

Follow these steps **in order**. Each step lists every file that must be touched.

### Step 1. Integration Package (`integrations/<channel>/`)

Create the directory and files:

```
integrations/<channel>/
  package.json
  tsconfig.json
  src/
    index.ts             → re-exports from integration.ts
    integration.ts       → Main IntegrationDefinition
    schema.ts            → Auth, config, action types (NOT types.ts)
    handlers/
      webhook.ts         → Webhook processing
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

**`src/schema.ts`** (use `schema.ts`, not `types.ts` — this is the project convention):

```typescript
import { customAuthSchema } from "@chatbotx.io/sdk"
import type { BaseConfig, CustomAuthValue } from "@chatbotx.io/sdk"
import { z } from "zod"

export type MyChannelConfig = BaseConfig

export const myChannelAuthSchema = customAuthSchema.extend({
  // channel-specific auth fields
})
export type MyChannelAuthValue = z.infer<typeof myChannelAuthSchema>

export type MyChannelActions = Record<string, never>
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
import type { MyChannelActions, MyChannelAuthValue } from "./schema"

const config: IntegrationDefinition<BaseConfig, MyChannelAuthValue, MyChannelActions> = {
  name: "<channel>",
  channels: {
    channel: {
      message: {},
    },
  },
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
  disconnect(_props: MyChannelAuthValue): Promise<void> {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration(config)
```

### Step 2. Database Schema

**`packages/database/src/schema/integration-<channel>.ts`:**

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
    // ... channel-specific columns
    workspaceId: bigintAsString().notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
    inboxId: bigintAsString().notNull()
      .references(() => inboxModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
    welcomeFlowId: bigintAsString()
      .references(() => flowModel.id, { onDelete: "set null", onUpdate: "cascade" }),
  },
  (table) => [
    index("Integration<Channel>_workspaceId_idx").using("btree", table.workspaceId.asc().nullsLast()),
    uniqueIndex("Integration<Channel>_inboxId_key").using("btree", table.inboxId.asc().nullsLast()),
    index("Integration<Channel>_welcomeFlowId_idx").using("btree", table.welcomeFlowId.asc().nullsLast()),
  ],
)
```

**`packages/database/src/relations/integration-<channel>.ts`:**

```typescript
import { defineRelationsPart } from "drizzle-orm"
import * as schema from "../schema"

export const integration<Channel>Relations = defineRelationsPart(schema, (r) => ({
  integration<Channel>Model: {
    workspace: r.one.workspaceModel({
      from: r.integration<Channel>Model.workspaceId, to: r.workspaceModel.id, optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integration<Channel>Model.inboxId, to: r.inboxModel.id, optional: false,
    }),
    flow: r.one.flowModel({
      from: r.integration<Channel>Model.welcomeFlowId, to: r.flowModel.id,
    }),
  },
}))
```

### Step 3. Database Registration (5 files)

All 5 files below MUST be updated:

| # | File | What to add |
|---|------|-------------|
| 1 | `packages/database/src/partials/channel.ts` | Add `"<channel>"` to `channelTypes` z.enum |
| 2 | `packages/database/src/partials/integration.ts` | Add `"<channel>"` to `integrationTypes` z.enum |
| 3 | `packages/database/src/schema/index.ts` | Add `export * from "./integration-<channel>"` |
| 4 | `packages/database/src/relations/index.ts` | **Both** `import { ... }` at top **and** `...integration<Channel>Relations` in the `relations` object |
| 5 | `packages/database/src/types.ts` | Add `export type Integration<Channel>Model = typeof schema.integration<Channel>Model.$inferSelect` |

> **GOTCHA**: `relations/index.ts` requires TWO edits (import + spread). It is very easy to add only one and miss the other. Always verify both.

### Step 4. Integration Registration (4 files)

| # | File | What to add |
|---|------|-------------|
| 1 | `apps/builder/src/integration.ts` | `import` **and** entry in `integrations` object |
| 2 | `apps/worker/src/services/integrations.ts` | `import` **and** entry in `allIntegrations` object |
| 3 | `apps/builder/package.json` | `"@chatbotx.io/integration-<channel>": "workspace:*"` in dependencies |
| 4 | `apps/worker/package.json` | `"@chatbotx.io/integration-<channel>": "workspace:*"` in dependencies |

> **GOTCHA**: When adding both `import` and usage entry, always verify the `import` statement was actually written. A common mistake is adding the usage (`"<channel>": integrationX`) but forgetting or failing to add the `import` line.

### Step 5. UI Registration (3 files)

| # | File | What to add |
|---|------|-------------|
| 1 | `apps/builder/src/features/inboxes/components/inbox-icon.tsx` | Add icon config to `INBOX_ICON_CONFIG` + import the icon |
| 2 | `apps/builder/src/features/inboxes/components/inbox-card-list.tsx` | Add entry to `cardConfigs` (can be `undefined` initially) |
| 3 | **All `Record<ChannelType, ...>` usages** | Search `Record<ChannelType` across the codebase and add the new key |

> **GOTCHA**: Adding a value to `ChannelType` Zod enum causes **compile errors** in every `Record<ChannelType, ...>` that doesn't include the new key. Always grep for `Record<ChannelType` or `Record<\n\s*ChannelType` (multiline) and fix all hits.

### Step 6. Builder Feature (`apps/builder/src/features/integration-<channel>/`)

Create the feature directory:

```
apps/builder/src/features/integration-<channel>/
  schema/
    mutation.ts          → Zod schemas for create/update requests
    resource.ts          → Select schema for API responses
  actions/
    create-<channel>.action.ts
    update-<channel>.action.ts
    delete-<channel>.action.ts
  queries/
    index.ts             → Server-side query functions
  components/
    create-<channel>-form.tsx
    <channel>-disconnect.tsx
  <channel>-manage.tsx   → Table + add button for settings page
```

**Key patterns:**

- **Create action**: uses `authActionClient.inputSchema(schema).action(...)`, creates `Inbox` + `Integration<Channel>` in a transaction
- **Update action**: uses `workspaceActionClient.bindArgsSchemas([zodBigintAsString(), zodBigintAsString()]).inputSchema(schema).action(...)`
- **Delete action**: uses `workspaceActionClient.bindArgsSchemas([zodBigintAsString(), zodBigintAsString()]).action(...)` — **no input schema**
- **Disconnect component**: when calling `execute()` on an action without input schema, pass **no arguments** (`execute()`, NOT `execute({})`)
- **Manage component**: uses `use(promises)` pattern to unwrap server promises in a client component

### Step 7. Settings Page (Parallel Route)

Create `apps/builder/src/app/space/[workspaceId]/(settings)/settings/channels/@<channel>/page.tsx`:

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

Update **`layout.tsx`** in the same directory — **3 places**:
1. Add `readonly <channel>: ReactNode` to `SettingsChannelsPageProps`
2. Add `<channel>` to the destructured props
3. Add `{ value: "<channel>", content: <channel> }` to `integrationItems` array

## Post-Creation Verification Checklist

After completing all steps above, run the following checks **in order**:

1. **Run `ReadLints`** on ALL modified files — catch undeclared variables, missing imports, and type errors
2. **Run `pnpm fix`** — auto-fix syntax/formatting issues (import ordering, trailing commas, etc.)
3. **Run `pnpm install --no-frozen-lockfile`** — link the new workspace package (required for new integration packages)
4. **Run `pnpm turbo build`** — final verification. If it fails, read the error output, fix the issues, and re-run until green

### Common Build Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module '@chatbotx.io/integration-<channel>'` | Package not linked | Run `pnpm install --no-frozen-lockfile` |
| `Property '<channel>' is missing in type ... Record<ChannelType, ...>` | Enum value added but not all Records updated | Search `Record<ChannelType` and add missing entry |
| `Argument of type '{}' is not assignable to parameter of type 'void'` | Calling `execute({})` on action without input schema | Use `execute()` with no arguments |
| `The ... variable is undeclared` | Import statement missing | Add the import — always verify **both** import and usage were written |

## Webhook Flow

1. **External platform** sends webhook to `/integrations/<channel>/webhook`
2. **Builder route** (`app/integrations/[...integration]/route.ts`) resolves integration config
3. **`handleRequest`** receives `{ config, req, queue }` — `queue` is BullMQ `integrationQueue`
4. Handler enqueues job: `queue.add("incomingMessage", { type, data })`
5. **Integration worker** picks up job, calls `allIntegrations[type].channels.channel.message.receiveMessage`
6. Worker processes message → creates/updates contact, conversation, runs flows

## Outbound Message Flow

1. **Chat worker** picks up outbound job from `chatQueue`
2. Resolves integration: `allIntegrations[contactInbox.channel]`
3. Calls `channels.channel.message.sendMessage` or `sendFlowStep`
4. Integration sends to platform API

## Existing Integrations Reference

| Integration | Webhook | Send | Receive | Notes |
|-------------|---------|------|---------|-------|
| messenger   | Yes     | Yes  | Yes     | Full Facebook Messenger |
| whatsapp    | Yes     | Yes  | Yes     | WhatsApp Business API |
| zalo        | Yes     | Yes  | Yes     | Zalo Official Account |
| webchat     | No      | No   | No      | PartySocket-based, in-app |
| chatbotx    | Yes     | Yes  | Yes     | Internal chatbot |
| email       | Yes     | No   | No      | SMTP email integration |
| google-sheets | No   | No   | No      | Spreadsheet integration |
| openai      | No      | No   | No      | AI provider |
