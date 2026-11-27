# Schema patterns and client usage

## Schema Patterns

Schemas live in `features/<feature>/schema/`:

```typescript
// schema/query.ts — list/filter request
export const listMyFeatureRequest = z.object({
  workspaceId: zodBigintAsString(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
  keyword: z.string().optional(),
})

// schema/resource.ts — response shapes
export const myFeatureResponse = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
})

// Reuse workspace ID schema
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
// .input(mySchema.and(withWorkspaceIdSchema))
```

## Client Usage

### React components (TanStack Query)

Rendering a list/detail read in a client component goes through TanStack
Query, not a bare `client.*()` call — it dedupes concurrent reads app-wide,
caches per query key, and lets any mutation invalidate every reader. See
`feature-scaffold` skill's "Server data (TanStack Query)" section for the full
hook shape (`features/ai-agents/hooks/use-ai-agents.ts` is the reference
implementation):

```typescript
import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

const { data, isPending } = useQuery(
  orpc.myFeatureAPI.listMyFeatureAPI.queryOptions({
    input: { workspaceId },
    enabled: Boolean(workspaceId),
  }),
)
```

Invalidate after a mutation with `.key()`:

```typescript
import { useQueryClient } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

const queryClient = useQueryClient()
queryClient.invalidateQueries({ queryKey: orpc.myFeatureAPI.key() })
```

`router.refresh()` alone is insufficient: it re-renders the RSC tree but does
not invalidate the browser TanStack Query cache, so call the invalidator in
every successful mutation handler.

### Imperative calls (event handlers, non-React code)

```typescript
import { client } from "@/lib/orpc/orpc"

const data = await client.myFeatureAPI.listMyFeatureAPI({ workspaceId })
```

### Server (SSR)

```typescript
// Automatically uses createRouterClient with server headers
const data = await client.myFeatureAPI.listMyFeatureAPI({ workspaceId })
```
