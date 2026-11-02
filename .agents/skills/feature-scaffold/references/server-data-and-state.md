# Server data (TanStack Query) and client-only state

## Server data (TanStack Query)

Fetched lists/detail reads (anything backed by an oRPC procedure) go through
TanStack Query, not a zustand store. See `orpc-api` skill's "React components
(TanStack Query)" subsection for the client-side call pattern. Shape
(`features/ai-agents/hooks/use-ai-agents.ts` is the reference implementation):

```typescript
// hooks/use-items.ts
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

export const useItems = (workspaceId: string | undefined) =>
  useQuery(
    orpc.<router>.<listProcedure>.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId),
      select: (res) => res.data,
    }),
  )

/** Call after create/update/delete so every reader refetches. */
export const useInvalidateItems = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: orpc.<router>.key() })
}
```

**Mutations:** Call the resource invalidator in every successful create, update,
delete, toggle, or move handler in addition to `router.refresh()`; invalidate
before any `router.push`. Existing invalidators include
`useInvalidateTags`, `useInvalidateInboxes`, `useInvalidateUsers`,
`useInvalidateSequences`, `useInvalidateCustomFields`,
`useInvalidateBotFields`, `useInvalidateFlows`, and `useSavedReplyCache`.
When a shared dialog mutates on behalf of multiple resources, give it an
`onSuccess` prop so each caller supplies its own invalidator.

Use `useWorkspaceId()` (`@/hooks/routing`) to scope the query to the current
workspace. Never put a fetched list, `loading`, or `error` in a zustand store —
TanStack Query already dedupes concurrent reads app-wide, caches per query key,
and lets any mutation invalidate every reader.

TanStack Query is the **only** client data-fetching layer — `lib/swr.ts` and
the `swr` package were removed once every `useClientQuery`/`useSWR*` consumer
was migrated. For less common shapes, reuse the shared helpers instead of
hand-rolling them again:

- **Search-as-you-type**: pass `placeholderData: keepPreviousData` (import the
  *function* from `@tanstack/react-query`, not `true`) plus
  `refetchOnWindowFocus: false` so the previous results stay on screen while a
  new keyword is in flight (`meta-catalog-product-select.tsx`).
- **Polling until a job settles** (export files, async worker results):
  `@/lib/query/poll-until-settled`'s `pollUntilSettled(settledStatuses)`
  returns a `refetchInterval` callback — TanStack passes it the `Query` (not
  the data), so it reads `query.state.data?.status`.
- **Fetching every page of a paginated list upfront** (not
  `useInfiniteQuery`'s incremental `fetchNextPage`):
  `@/lib/query/fetch-all-pages`'s `fetchAllPages({ fetchPage, initialPageParam,
  maxPages })` loops and flattens every page in one `queryFn`.

## Client-only state (Zustand)

For features needing client-only state (selection, open/closed dialogs,
in-progress form state — never a fetched list):

```typescript
// provider/item-store.ts
import { createStore } from "zustand/vanilla"

type ItemState = {
  selectedId: string | null
}

type ItemActions = {
  setSelectedId: (id: string | null) => void
}

export type ItemStore = ItemState & ItemActions

export const createItemStore = (initial: Partial<ItemState> = {}) =>
  createStore<ItemStore>((set) => ({
    selectedId: null,
    ...initial,
    setSelectedId: (id) => set({ selectedId: id }),
  }))
```

Wrap with React context provider (`provider/item-store-provider.tsx`).
