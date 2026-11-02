# Server actions, action clients and queries

## Server Actions

Use `next-safe-action` with workspace-scoped client:

```typescript
// actions/create-item-action.ts
"use server"

import { workspaceActionClient } from "@/lib/safe-action"
import { createItemRequest } from "../schema/action"

export const createItemAction = workspaceActionClient
  .bindArgsSchemas([z.string()]) // workspaceId
  .inputSchema(createItemRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }) => {
      return await createItem({ workspaceId, ...parsedInput })
    },
  )
```

### Action Clients

All six live in `apps/builder/src/lib/safe-action.ts`. Default to the most restrictive one
that fits (fail closed):

| Client | Gate |
|---|---|
| `workspaceActionClient` (`:141`) | workspace membership **+** trial-expiry gate — the default for feature actions |
| `workspaceActionClientAllowExpired` (`:96`) | membership, **skips** the expiry gate. Only for delete/disconnect/cancel that must stay available post-expiry (repo invariant 14) |
| `workspaceActionClientAllowScheduledDeletion` (`:174`) | membership, tolerates a workspace inside its soft-delete grace window |
| `superAdminActionClient` (`:89`) | authenticated **+** super admin |
| `platformAdminActionClient` (`:80`) | authenticated **+** platform admin |
| `authActionClient` (`:43`) | authenticated session only — no workspace scope |

## Queries (Server-Side)

**Rule:** The chain is `action | API handler → service → repository → DB`.
Queries must NOT import `db` or `@chatbotx.io/database/schema` directly — call
a service from `@chatbotx.io/business`. Neither module is importable from
`apps/builder/src/features/*/queries/*.ts`. See `.agents/rules/data-access.md`
for the full contract.

A query file's job is narrow: turn session context into plain params, call
the service, shape the response. It holds no where-builders, pagination, or
count logic — that lives in the service (or the repository behind it).

### No session context needed → skip the query file

If a query would do nothing but forward its arguments to a service, don't
write the file — call the service directly from the caller:

```typescript
// No query file needed — tagService.list needs nothing from the session.
import { tagService } from "@chatbotx.io/business"

const { data } = await tagService.list({ workspaceId })
```

### Session context needed → a thin adapter

```typescript
// queries/get-contact.query.ts
import { contactService } from "@chatbotx.io/business"
import { requireContactPermissionScope } from "../permissions"

export async function getContact(input: { workspaceId: string; id: string }) {
  const accessScope = await requireContactPermissionScope(input.workspaceId)
  return await contactService.findDetailOrFail({
    workspaceId: input.workspaceId,
    id: input.id,
    accessScope,
  })
}

// RSC wrapper with auth check
export const listItemsRSC = async (params: ListItemsParams) => {
  await assertCurrentUserCanAccessChatbot(params.workspaceId)
  return listItems(params)
}
```
