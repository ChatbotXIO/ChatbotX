# Public procedures and feature API structure

## Feature API Structure

Each feature has an `api/` directory. `public.ts` is required (see "When a public
procedure is required"); the private files exist only when the UI needs
session-authed procedures:

```
features/my-feature/
  api/
    index.ts    → private (session) API only — public procedures are NOT
                  spread in here; they're mounted separately in
                  routers/public.ts (see below)
    private.ts  → session-based procedures (private naming: see below)
    public.ts   → REQUIRED — token-based procedures (public API → CLI/MCP)
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

**Every DELETE (and any other body-less mutation) declares `successStatus:
204`** — a handler with no `.output(...)` returns `undefined`, and without
an explicit `successStatus` oRPC defaults to `200` with an empty body, which
misrepresents the response. `apps/builder/__tests__/public-spec-operations.test.ts`
enforces this across the whole public spec: every operation whose generated
response has no declared body schema must document `successStatus: 204`
(and nothing else in the 2xx range). If a mutation's handler actually
`return`s data, add `.output(...)` instead of `successStatus: 204` — don't
declare a body-less success status on a route that has a body.

```typescript
  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/my-feature/{id}",
      summary: "Delete item",
      tags: ["MyFeature"],
      successStatus: 204,
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await myFeatureService.delete({ id: input.id, workspaceId: context.workspace.id })
    }),
```

**`mcpSpec`/`x-mcp` controls MCP-specific tool metadata** beyond what
`summary`/`description`/`tags` cover — visibility in `tools/list`, whether a
token-scope check can be bypassed so the tool is discoverable even when the
caller lacks its scope, and the MCP read-only/destructive/idempotent hints.
Import `mcpSpec` from `@/lib/orpc/mcp-annotations` and pass it as the
function form of `.route({ spec: ... })` — **never a plain object**, which
the OpenAPI generator treats as a full replacement of the generated
operation (dropping `parameters`/`requestBody`/`responses`) rather than a
merge:

```typescript
import { mcpSpec } from "@/lib/orpc/mcp-annotations"

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/my-feature",
      summary: "List items",
      tags: ["MyFeature"],
      spec: mcpSpec({ visibility: "default" }),
    })
    // ...
```

- `visibility: "default"`** ships the tool in `tools/list` on every MCP
  connection. The polarity is inverted from what you'd expect: **omitting
  `spec` entirely (or `visibility` absent from it) means `"hidden"`** —
  reachable only through the `search_tools`/`call_tool` meta-tools, not the
  default connection payload. We cannot ask every one of the ~350 public
  operations to opt out individually, so only the ~40 operations an agent
  needs on every connection (list/get the most common resources, publish a
  flow, etc.) opt IN.
- `alwaysVisible: true` exempts an operation from scope-based `tools/list`
  filtering — reserved for the small set of discovery endpoints
  (`capabilities.get`, `token.get`) a token must be able to *see* even when
  it lacks the scope those endpoints themselves require, so the caller gets
  a 403 body instead of the tool silently disappearing.
- `readOnlyHint`/`destructiveHint`/`idempotentHint` override the mcp-server
  loader's HTTP-method-based inference (GET ⇒ read-only/idempotent, DELETE ⇒
  destructive/idempotent, everything else ⇒ none) when an operation doesn't
  fit that default.
- `hitlPolicy` is inferred from the HTTP method and operation id for every
  operation. Set `hitlPolicy: "none"` on a non-mutating POST; add
  `readOnlyHint: true` only when a `read_only` token may call it.

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
