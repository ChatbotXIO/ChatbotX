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
- Base context: `{ headers, user?, workspace? }`
- Two auth stacks: `authorizedAPI` (session) and `workspaceTokenAuthAPI` (header token)
- Routers are plain objects of procedures, composed via object spreading

## Auth Stacks

Defined in `apps/builder/src/orpc.ts`:

- **`authorizedAPI`**: `base` → error mapping → `authMiddleware` (session/cookie auth)
- **`workspaceTokenAuthAPI`**: `base` → error mapping → `workspaceTokenAuthMidddleware` (X-CHATBOT-TOKEN header)

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
    index.ts            → merges authenticated + workspace-token APIs
    authenticated.ts    → session-based procedures
    workspace-token.ts  → token-based procedures (for public API)
```

### api/index.ts

```typescript
import { myFeatureAuthenticatedAPI } from "./authenticated"
import myFeatureWorkspaceTokenAPIs from "./workspace-token"

export const myFeatureAPI = {
  ...myFeatureWorkspaceTokenAPIs,
  ...myFeatureAuthenticatedAPI,
}
```

### Workspace-token procedures (public API)

```typescript
import { workspaceTokenAuthAPI } from "@/orpc"

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

Add to `apps/builder/src/routers/index.ts`:

```typescript
import { myFeatureAPI } from "@/features/my-feature/api"

export const router = {
  // ...existing routes
  myFeatureAPI,
}
```

For public API (workspace-token), also add to `apps/builder/src/routers/public.ts`.

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

Throw `ChatbotXException` or `ModelNotfoundException` — they are auto-mapped to oRPC errors in the global `onError` interceptor:

```typescript
import { ChatbotXException, notFoundException } from "@chatbotx.io/sdk"

throw notFoundException("Item not found")
throw new ChatbotXException("Custom error", "BAD_REQUEST", 400)
```
