---
name: feature-scaffold
description: >-
  Scaffold new features following project conventions for the builder app.
  Use when creating a new feature, page, component, server action, query,
  or adding a new section to the web application.
---

# Feature Scaffold

## Feature Directory Structure

Features live in `apps/builder/src/features/<feature-name>/`. Standard layout:

```
features/<feature-name>/
  actions/              → Server actions (next-safe-action)
    create-item-action.ts
    delete-item-action.ts
  api/                  → oRPC route handlers
    index.ts
    authenticated.ts
    workspace-token.ts
  queries/              → Server-side DB queries
    index.ts
  schema/               → Zod schemas
    query.ts            → List/filter params
    action.ts           → Mutation inputs
    resource.ts         → Response shapes
  provider/             → Zustand store + context (if needed)
    item-store.ts
    item-store-provider.tsx
  components/           → UI components (if many)
  hooks/                → Feature-specific hooks (if needed)
  item-table.tsx        → Root-level components (if few)
  create-item-dialog.tsx
```

Not every feature needs all directories. Use what's appropriate.

## Page Pattern (Server Component)

```typescript
// app/space/[workspaceId]/(has-folder)/<feature>/page.tsx
import { Suspense } from "react"
import { getIdFromParams } from "@/lib/params"
import { listItems } from "@/features/<feature>/queries"
import { ItemsTable } from "@/features/<feature>/items-table"

export default async function ItemsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  const searchParams = await props.searchParams
  const search = listItemsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listItems({ ...search, workspaceId }),
  ])

  return (
    <Suspense>
      <ItemsTable promises={promises} workspaceId={workspaceId} />
    </Suspense>
  )
}
```

### Key Page Patterns

- Pages are **async server components** (no `"use client"`)
- `params` and `searchParams` are `Promise<...>` (Next.js 15+ style)
- Use `getIdFromParams()` to extract and validate IDs
- Pass `Promise.all([...])` as `promises` prop to client components
- Client components unwrap with `React.use(promises)`
- URL state via **nuqs** (`listItemsSearchParamsCache.parse()`)

## Client Component Pattern

```typescript
"use client"

import { use } from "react"

type Props = {
  promises: Promise<[ItemList]>
  workspaceId: string
}

export const ItemsTable = ({ promises, workspaceId }: Props) => {
  const [items] = use(promises)

  return (
    // Table UI using @chatbotx.io/ui components
  )
}
```

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

- `workspaceActionClient` — requires workspace membership
- `authActionClient` — requires authenticated session only

## Queries (Server-Side)

```typescript
// queries/index.ts
import { db } from "@chatbotx.io/database/client"

export const listItems = async (params: ListItemsParams) => {
  return db.query.myModel.findMany({
    where: { workspaceId: params.workspaceId },
    with: { tags: true },
  })
}

// RSC wrapper with auth check
export const listItemsRSC = async (params: ListItemsParams) => {
  await assertCurrentUserCanAccessChatbot(params.workspaceId)
  return listItems(params)
}
```

## Forms

Use React Hook Form + Zod + next-safe-action adapter:

```typescript
"use client"

import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createItemAction } from "../actions/create-item-action"
import { createItemRequest } from "../schema/action"

export const CreateItemForm = ({ workspaceId }: { workspaceId: string }) => {
  const { form, handleSubmitWithAction } = useHookFormAction(
    createItemAction.bind(null, workspaceId),
    zodResolver(createItemRequest),
    { formProps: { defaultValues: { name: "" } } },
  )

  return (
    <form onSubmit={handleSubmitWithAction}>
      {/* Form fields using @chatbotx.io/ui form components */}
    </form>
  )
}
```

## State Management (Zustand)

For features needing client-side state:

```typescript
// provider/item-store.ts
import { createStore } from "zustand/vanilla"

type ItemState = {
  items: Item[]
  selectedId: string | null
}

type ItemActions = {
  setSelectedId: (id: string | null) => void
}

export type ItemStore = ItemState & ItemActions

export const createItemStore = (initial: Partial<ItemState> = {}) =>
  createStore<ItemStore>((set) => ({
    items: [],
    selectedId: null,
    ...initial,
    setSelectedId: (id) => set({ selectedId: id }),
  }))
```

Wrap with React context provider (`provider/item-store-provider.tsx`).

## Import Conventions

| What | Path |
|------|------|
| App internal | `@/features/<feature>/...`, `@/lib/...`, `@/components/...` |
| Shared UI | `@chatbotx.io/ui/<component>` |
| Database | `@chatbotx.io/database/client`, `@chatbotx.io/database/schema` |
| Types | `@chatbotx.io/database/types` |
| oRPC client | `@/lib/orpc/orpc` |
| oRPC stacks | `@/orpc` (for `authorizedAPI`, `workspaceTokenAuthAPI`) |
| Auth middleware | `@/middlewares/auth` |
| Safe action clients | `@/lib/safe-action` |

## Layout Patterns

- **Route groups** `()` organize without URL segments: `(settings)`, `(has-folder)`, `(ai)`
- **Parallel routes** `@slot` for multi-panel layouts (e.g. channels settings)
- **Workspace layout** at `space/[workspaceId]/layout.tsx`: auth, sidebar, workspace context
- Server layouts: auth checks, data loading
- Client layouts: tabs, accordions, interactive navigation

## Checklist for New Feature

1. Create feature directory under `src/features/<name>/`
2. Define Zod schemas in `schema/`
3. Create DB queries in `queries/`
4. Add server actions in `actions/` (if mutations needed)
5. Create oRPC API in `api/` (if API access needed)
6. Register router in `src/routers/index.ts`
7. Create page(s) under `src/app/space/[workspaceId]/...`
8. Build UI components (server page → client table/form)
