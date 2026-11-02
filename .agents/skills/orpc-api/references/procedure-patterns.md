# oRPC procedure patterns

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
import { zodBigintAsString } from "@chatbotx.io/utils"

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
