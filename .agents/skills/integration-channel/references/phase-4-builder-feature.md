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
