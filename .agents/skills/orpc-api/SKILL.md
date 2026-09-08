---
name: orpc-api
description: >-
  Create and modify oRPC API routers, procedures, and middleware for the builder
  app. Use when adding API endpoints, creating routers, defining procedures,
  working with oRPC middleware, or building OpenAPI routes.
---

# oRPC API Development

## Architecture

- **oRPC** serves both **RPC** (`/rpc`) and **OpenAPI** (`/api`) endpoints
- `/api` serves **only** `publicRouter` (workspace-token / channel-token authed procedures). Private, session-authed procedures are reachable via `/rpc` (from the builder) only — there is no full-router HTTP mirror. `OpenAPIReferencePlugin` serves Scalar docs at `GET /api` and the spec at `/api/spec.json` for the public router.
- Base context: `{ headers, url?, user?, workspace?, apiToken? }`
- Three auth stacks: `authorizedAPI` (session), `workspaceTokenAuthAPIForScope(scope)` (Bearer workspace API token) and `channelApiTokenAPI` (Bearer channel API token)
- Routers are plain objects of procedures, composed via object spreading

## Auth Stacks

Defined in `apps/builder/src/orpc.ts`:

- **`authorizedAPI`**: `base` → error mapping → `authMiddleware` (session/cookie auth)
- **`workspaceTokenAuthAPIForScope(scope)`**: `base` → error mapping → `workspaceTokenAuthMidddleware` (Authorization: Bearer header) → `requireTokenScope(scope)`. There is deliberately no unscoped variant — every workspace-token endpoint must declare its resource scope. The middleware sets `context.workspace` plus a projected `context.apiToken` (`id`, `workspaceId`, `permission`, `scopes`, `isDefault` — never `tokenHash`/`encryptedToken`). See `docs/developer/workspace-api-tokens.md`.
- **`channelApiTokenAPI`**: `base` → error mapping → `channelApiTokenAuthMidddleware` (Authorization: Bearer header only — no query fallback; token is looked up by hash, never plaintext; scoped to a single inbox, not a whole workspace; see `middlewares/channel-api-token-auth.ts`)

Workspace-scoped procedures add `workspaceAuthorizedMidddleware` per-procedure.

Handlers never talk to the database themselves — see the `business-data-access`
skill and `.agents/rules/data-access.md` for the full `action | API handler →
service → repository → DB` chain and the `.query.ts` file contract.

## Creating a New Procedure

The chain is `action | API handler → service → repository → DB` (see
`.agents/rules/data-access.md`). A handler's job is: resolve session context
(or none, for a token caller) → call a service method → shape the response.
It never holds where-builders, pagination, or count logic itself.

```typescript
import { myFeatureService } from "@chatbotx.io/business"
import { authorizedAPI } from "@/orpc"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { z } from "zod"
import { zodBigintAsString } from "@chatbotx.io/database/schema"

export const myFeatureAuthenticatedAPI = {
  listMyFeatureAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/my-feature",
      summary: "List my feature items",
      tags: ["MyFeature"],
    })
    .input(
      z.object({
        workspaceId: zodBigintAsString(),
        perPage: z.coerce.number().optional(),
        cursor: z.string().optional(),
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(myFeatureListResponse)
    .handler(async ({ input, context }) => {
      return await myFeatureService.list(input)
    }),

  createMyFeatureAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/my-feature",
      summary: "Create a new item",
      tags: ["MyFeature"],
    })
    .input(createMyFeatureRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      return await myFeatureService.create(input)
    }),
}
```

### Public and private procedures for the same resource share one service method

Only the app layer resolves the caller's permission scope and passes it into
the service as plain data — the service itself never inspects whether the
caller was a signed-in member or a workspace token:

```typescript
// Private (session) — resolves a scope from the member's permissions
export const myFeatureAuthenticatedAPI = {
  listMyFeatureAPI: authorizedAPI
    // ...
    .handler(async ({ input, context }) => {
      const scope = await requireMyFeaturePermissionScope(input.workspaceId)
      return await myFeatureService.list({ ...input, scope })
    }),
}

// Public (workspace token) — unscoped, no member permissions to resolve
export const myFeaturePublicRouter = {
  list: workspaceTokenAuthAPI
    // ...
    .handler(async ({ context, input }) =>
      await myFeatureService.list({
        ...input,
        workspaceId: context.workspace.id,
      }),
    ),
}
```

Never write a second implementation of the same list/filter/mutation logic
for the public path — both handlers must converge on the same service method
so a bug fix or a new filter only has to happen once. See
`packages/business/src/contact/list.ts` for a worked example
(`contactService.list`/`count` called from both the private
`list-contacts.queries.ts` adapter and the public `crud.ts` handler).

### Procedure Chain

```
authorizedAPI
  .route({ method, path, summary, tags })  → OpenAPI metadata
  .input(zodSchema)                         → request validation
  .use(middleware, mapperFn)                 → per-procedure middleware (optional)
  .output(zodSchema)                        → response validation (optional)
  .handler(async ({ input, context }) => {})→ business logic
```

## Feature API Structure

Each feature has `api/` directory with optional split:

```
features/my-feature/
  api/
    index.ts    → private (session) API only — public procedures are NOT
                  spread in here; they're mounted separately in
                  routers/public.ts (see below)
    private.ts  → session-based procedures (private naming: see below)
    public.ts   → token-based procedures (for public API)
```

If a feature has no private procedures at all, it has no `api/index.ts` and
is not mounted in `routers/index.ts` — only `api/public.ts`, wired into
`routers/public.ts`.

### api/index.ts (private only)

```typescript
import { myFeatureAuthenticatedAPI } from "./private"

export const myFeatureAPI = {
  ...myFeatureAuthenticatedAPI,
}
```

### Public procedures (`api/public.ts`)

Key naming: CRUD resources use plain `list`, `get`, `create`, `update`,
`delete`; anything else is a verb + secondary noun (`listOptions`,
`getStats`, `upsert`, `block`, `sendMessage`). Never prefix keys with the
resource name or an auth suffix (no `WorkspaceTokenAPI`, no
`listMyFeature`) — the resource name already comes from the router nesting
in `routers/public.ts`, and the key becomes the last segment of the
generated `operationId` (`myFeature.get`), which the MCP server turns into
the tool name (`my_feature_get`).

```typescript
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

// Pick the resource-area scope this feature belongs to
// (workspaceApiTokenScopes in packages/database/src/partials/workspace-api-token.ts)
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const myFeaturePublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/my-feature/{id}",
      summary: "Get item by ID",
      tags: ["MyFeature"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicMyFeatureResponse)
    // Declares only what varies by operation shape — see "Declared errors"
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      // context.workspace is available from token auth
      return await findMyFeature({
        id: input.id,
        workspaceId: context.workspace.id,
      })
    }),
}
```

Register it in `apps/builder/src/routers/public.ts`, nested under the
resource name:

```typescript
import { myFeaturePublicRouter } from "@/features/my-feature/api/public"

export const publicRouter = {
  // ...existing resources
  myFeature: myFeaturePublicRouter,
}
```

**`summary` is what the MCP server shows as the tool description** —
`apps/mcp-server/src/openapi-loader.ts`'s `buildToolDescription` joins
`summary` and `description` (when both are set) into one string, so use
`summary` for the one-line action and `description` for longer usage
guidance (valid values, example payloads, edge cases) an LLM needs to pick
the right tool and fill it in correctly. A `findByCustomField`-style
endpoint with ambiguous input shape should always set `description`.

**`include`/`withCount` convention for list endpoints**: a public list
endpoint whose row shape has optional relations or an expensive count query
should accept `include?: string[]` (narrows the response payload — see
`contactService.list`'s `include`/`withCount` options in
`packages/business/src/contact/list.ts`, which strips fields post-query
rather than fighting Drizzle's relational-query type inference with a
dynamic `with:`) and `withCount?: boolean` (default `true`, skips the count
query entirely when `false` — the actual latency win, since the DB join
happens either way). Only add this pair when a list endpoint's default
response is genuinely heavy; a small resource with no relations doesn't need
it.

**Split `api/public.ts` (and its `schema/public.ts`) into submodules once
either exceeds ~400 lines or accumulates more than one unrelated concern** —
see `features/contacts/api/public/{crud,tags,custom-fields,bulk,export,
refresh-profile,messages}.ts` and the matching
`features/contacts/schema/public/*.ts`. Each submodule should import only
what its own procedures need; a shared `schema/public.ts` that pulls in
every feature's resource schemas (e.g. through a heavyweight file like
`schema/query.ts`) makes every submodule's unit test pay that whole import
cost even when it only needs one small schema. A submodule that hangs
routes off another resource's path prefix (like `messages.ts`'s
`/v1/contacts/{identifier}/messages`) still calls
`workspaceTokenAuthAPIForScope` with **its own** scope, never the owning
feature's — see the endpoint-to-scope table in
`docs/developer/workspace-api-tokens.md`.

**Prefer a sibling feature's own `api/public.ts` over a submodule when the
resource already has its own feature directory** — contact notes, contact
sequences, contact inboxes, and contact filter fields each publish their own
`features/<feature>/api/public.ts` + `schema/public.ts` (not
`features/contacts/api/public/{notes,sequences,inboxes,filter-fields}.ts`),
and `features/contacts/api/public.ts` composes their exported router objects
in alongside its own submodules:

```ts
import { contactsNotesPublicRouter } from "@/features/contact-notes/api/public"
// ...
export const contactsPublicRouter = {
  ...contactsCrudPublicRouter,
  ...contactsNotesPublicRouter,
  // ...
}
```

Router key and path stay unchanged either way — only the source file moves
to live with the feature that owns the resource's business logic. The
public handler and its equivalent server action must call the **same**
service method; the action is the only place that resolves the caller's
permission scope (via `requireContactPermissionScope`/
`resolveContactPermissionScope`) — the public handler passes no
`accessScope`, since a workspace-token caller is never member-scoped.

## Registering the Router

Add to `apps/builder/src/routers/index.ts` as a **lazy branch** — every feature
router there is wrapped in oRPC's `lazy()` so the feature's api module (and its
import graph) only loads on the first call that targets it, instead of all ~58
feature api modules loading with the route handler:

```typescript
import { lazy } from "@orpc/server"

export const router = {
  // ...existing routes
  myFeatureAPI: lazy(() =>
    import("@/features/my-feature/api").then((m) => ({
      default: m.myFeatureAPI,
    })),
  ),
}
```

Two failure modes to watch: the `import("...")` specifier must stay a literal
string (the bundler needs to statically analyze it), and the picked export
name must match the module's actual export — a mismatch produces
`default: undefined`, which fails at the first call to that branch rather than
at build time. Dynamic `import()` is allowed here because `apps/builder` is
Next.js-built (see `.agents/rules/no-dynamic-import.md`).

For public API (`api/public.ts`), don't add the feature to `routers/index.ts`
at all if it has no private procedures — register it only in
`apps/builder/src/routers/public.ts` (see above), nested under the resource
name. That router stays **eager** (plain imports); it feeds `/api/spec.json`,
and its `operationId`s (`resource.key`) are what the MCP server turns into
tool names.

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

## Error Handling

Throw `ChatbotXException` or `ModelNotfoundException` — they are auto-mapped to oRPC errors by `mapKnownOrpcErrors` (`apps/builder/src/orpc.ts`), the middleware-level `onError` interceptor shared by all three auth stacks: it warn-logs and remaps known errors, leaving anything else untouched. Unknown errors are logged exactly once at error level by `logUnexpectedOrpcErrorCallback` (`apps/builder/src/lib/orpc/handlers.ts`), the route-level interceptor used by the `/api` and `/rpc` handlers:

```typescript
import { ChatbotXException, notFoundException } from "@chatbotx.io/sdk"

throw notFoundException("Item not found")
throw new ChatbotXException("Custom error", "BAD_REQUEST", 400)
```

### Declared errors (`.errors()`) — public routes only

Every public procedure must declare the errors it can throw, because that
declaration is what renders the non-2xx responses in the OpenAPI spec (and
what the MCP server and CLI show a caller). The declaration is split in two:

| Layer | Where | Contains |
|-------|-------|----------|
| Shared | `commonApiErrors`, attached **once** to the public stacks in `@/orpc` | 401 (`UNAUTHORIZED`, `INVALID_CHATBOT_TOKEN`), 403 (`FORBIDDEN`, `trialExpired`, `macLimitReached`), 422 (`invalidRequestData`, `validation`), 429 (`tooManyRequests`), 500 (`INTERNAL_SERVER_ERROR`) |
| Per-route | one `possibleErrorsOn*Resource` set from `@/lib/orpc/orpc-error-helper` | only what varies by operation shape — `notFound` (404) and `businessError` (400) |

Pick the per-route set by what the handler can actually fail with, not by the
HTTP verb:

- `possibleErrorsOnListingResource` — a collection read that cannot 404.
- `possibleErrorsOnFindingResource` — a read that resolves one resource.
- `possibleErrorsOnCreatingResource` — a create with no parent lookup.
- `possibleErrorsOnMutatingResource` — an update, **or a create that resolves a
  parent from a path param** (e.g. `POST /v1/contacts/{identifier}/notes` calls
  `contactService.resolveIdByIdentifier`, which throws 404).
- `possibleErrorsOnDeletingResource` — a delete.

**Never re-declare a `commonApiErrors` code in a per-route set.** Doing so
duplicates the entry in the generated spec. The guard in
`apps/builder/__tests__/public-spec-operations.test.ts` fails on both mistakes:
a route missing a universal code, and a duplicated one.

**The `code` string is the contract, not the status.** oRPC matches a thrown
`ORPCError` to its declaration by `code` *and* exact `status`
(`validateORPCError` in `@orpc/contract`). On a miss it does not error — it
returns the error with `defined: false`, so an undeclared code still reaches
the client but never appears in the spec. That silent degrade is why a new
`ChatbotXException` code thrown from a public route needs a matching entry in
one of these sets.

## Logging

Import the logger from the nearest `lib/log` or `lib/logger` module. Never use `console` in handlers.

```typescript
import { logger } from "../lib/log"

.handler(async ({ input }) => {
  try {
    return await doWork(input)
  } catch (error) {
    logger.error({ err: error, ...input }, "[myFeature] handler failed")
    throw error
  }
})
```

**Key rule:** always use `err: error` (not `error: error`) so pino serializes the stack trace.
