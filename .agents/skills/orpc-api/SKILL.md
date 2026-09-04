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
- Two auth stacks: `authorizedAPI` (session) and `workspaceTokenAuthAPIForScope(scope)` (Bearer workspace API token)
- Routers are plain objects of procedures, composed via object spreading

## Auth Stacks

Defined in `apps/builder/src/orpc.ts`:

- **`authorizedAPI`**: `base` → error mapping → `authMiddleware` (session/cookie auth)
- **`workspaceTokenAuthAPIForScope(scope)`**: `base` → error mapping → `workspaceTokenAuthMidddleware` (Authorization: Bearer header) → `requireTokenScope(scope)`. There is deliberately no unscoped variant — every workspace-token endpoint must declare its resource scope. The middleware sets `context.workspace` plus a projected `context.apiToken` (`id`, `workspaceId`, `permission`, `scopes`, `isDefault` — never `tokenHash`/`encryptedToken`). See `docs/developer/workspace-api-tokens.md`.
- **`channelApiTokenAPI`**: `base` → error mapping → `channelApiTokenAuthMidddleware` (Authorization: Bearer header only — no query fallback; token is looked up by hash, never plaintext; scoped to a single inbox, not a whole workspace; see `middlewares/channel-api-token-auth.ts`)

Workspace-scoped procedures add `workspaceAuthorizedMidddleware` per-procedure.

## Creating a New Procedure

```typescript
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
      return await listMyFeature(input)
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
      return await createMyFeature(input)
    }),
}
```

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
    index.ts            → merges private (session) + workspace-token APIs
    private.ts          → session-based procedures
    workspace-token.ts  → token-based procedures (for public API)
```

### api/index.ts

```typescript
import { myFeatureAuthenticatedAPI } from "./private"
import myFeatureWorkspaceTokenAPIs from "./workspace-token"

export const myFeatureAPI = {
  ...myFeatureWorkspaceTokenAPIs,
  ...myFeatureAuthenticatedAPI,
}
```

### Workspace-token procedures (public API)

```typescript
import { workspaceTokenAuthAPIForScope } from "@/orpc"

// Pick the resource-area scope this feature belongs to
// (workspaceApiTokenScopes in packages/database/src/partials/workspace-api-token.ts)
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const workspaceTokenAPIs = {
  findMyFeaturePublicAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/my-feature/{id}",
      summary: "Get item by ID",
      tags: ["MyFeature"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicMyFeatureResponse)
    .handler(async ({ context, input }) => {
      // context.workspace is available from token auth
      return await findMyFeature({
        id: input.id,
        workspaceId: context.workspace.id,
      })
    }),
}

export default workspaceTokenAPIs
```

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

For public API (workspace-token), also add to `apps/builder/src/routers/public.ts` —
that router stays **eager** (plain imports); it feeds `/api/public-spec.json`.

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

### Browser (client components)

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
