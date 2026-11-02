# Page, public route and client component patterns

## Page Pattern (Server Component)

```typescript
// app/space/[workspaceId]/(has-folder)/<feature>/page.tsx
import { Suspense } from "react"
import { getIdFromParams } from "@chatbotx.io/utils"
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

### Public routes (short links, webhooks, open redirects)

Some features expose **unauthenticated** URLs (tracking links, asset callbacks, etc.):

- Implement the handler as a **Route Handler** under `apps/builder/src/app/<public-prefix>/.../route.ts` (or `page.tsx` when appropriate).
- Add the URL prefix to `PUBLIC_ROUTES` in `apps/builder/src/lib/public-routes.ts` (read by `proxy.ts`) so the middleware does not force sign-in for those paths.
- Put redirect rules, URL templating, and validation in a small `lib/*` module when the same logic might be reused or tested.
- Register new **Tools** entries in `apps/builder/src/features/tools/tools-list.tsx` (with `getLink`) and add **i18n** keys under `apps/builder/messages/*.json`.

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
