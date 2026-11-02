---
name: orpc-api
description: >-
  Single source for the builder's oRPC API layer. Use when adding or changing an
  API endpoint or a public procedure (`features/<x>/api/public.ts`), choosing an
  auth stack (`authorizedAPI`, `workspaceTokenAuthAPIForScope`,
  `channelApiTokenAPI`, `workspaceTokenAuthMidddleware`, three d's), registering
  a router in `routers/index.ts` or `routers/public.ts`, declaring `.errors()`,
  tagging MCP tools (`mcpSpec`), building a result-returning operation (link,
  preview, test send, stats, export, AI generation), or calling procedures from
  the client (`orpc.<router>.<proc>.queryOptions()`, `client.*`).
---

# oRPC API Development

## Architecture

- oRPC serves **RPC** (`/rpc`) and **OpenAPI** (`/api`). `/api` serves **only** `publicRouter` (workspace-token / channel-token procedures); private session procedures are reachable via `/rpc` from the builder only. Scalar docs at `GET /api`, spec at `/api/public-spec.json`.
- Base context: `{ headers, url?, user?, workspace?, apiToken? }`. Routers are plain objects of procedures, composed by spreading.
- Handlers never touch the database: `action | API handler → service → repository → DB` (`business-data-access` skill, `.agents/rules/data-access.md`). Never create a `*.service.ts` inside a feature folder; services live in `packages/business/src/<domain>/service.ts` (move a legacy one before extending it).

## Auth stacks (`apps/builder/src/orpc.ts`)

- **`authorizedAPI`**: error mapping → `authMiddleware` (session/cookie). Workspace-scoped procedures add `workspaceAuthorizedMidddleware` per procedure.
- **`workspaceTokenAuthAPIForScope(scope)`**: error mapping → `workspaceTokenAuthMidddleware` (Bearer) → `requireTokenScope(scope)`. No unscoped variant: every workspace-token endpoint declares its resource scope. Sets `context.workspace` and a projected `context.apiToken` (never `tokenHash`/`encryptedToken`). See `docs/developer/workspace-api-tokens.md`.
- **`channelApiTokenAPI`**: error mapping → `channelApiTokenAuthMidddleware` (Bearer header only, no query fallback; looked up by hash; scoped to one inbox). See `middlewares/channel-api-token-auth.ts`.

The middleware names have three `d`s (kept for backward compat; AGENTS.md invariant 1).

## Agent-first: when a public procedure is required

Always, by default (AGENTS.md invariant 23). The CLI and MCP server build their whole surface from `publicRouter` (`/api/public-spec.json`); an operation without a public procedure is invisible to AI agents. Every feature, and every new operation on an existing feature, adds its procedure to `api/public.ts` before (or with) the UI. "Operation" means anything a user can do from the UI, not just CRUD.

Exempt only (state why in the PR): sign-in/sign-up and personal account settings; platform administration (super admin, reseller, tenant, platform credentials); end-customer public pages (webviews, short links, booking pages); the browser-redirect step of a channel OAuth connect (post-connect read, settings, disconnect still need procedures); UI-only plumbing (device push tokens, realtime, help items); anything a workspace token must never do (minting/revoking API tokens).

Public and private paths for one resource call the **same service method**; only the app layer resolves the caller's permission scope and passes it as plain data. Never write a second implementation for the public path (worked example: `contactService.list`). See `references/procedure-patterns.md`.

## Result-returning operations

An operation whose point is to give the caller something back rather than change a stored resource.

| Kind | Examples | Already in `publicRouter` |
|---|---|---|
| Link / code | shareable preview link, embed snippet | `botSimulator.getLink` |
| Preview / render | render a template or message with variables | — |
| Test run | test send, run a flow for one contact, test a connection | — |
| Stats / report | counts, time series, breakdowns | `analytics.*`, `ads.analytics.overview` |
| Export | CSV/JSON export | `ads.conversions.export`, contacts export |
| AI generation | generate a reply, summarize, suggest | — |
| Status / sync / scan | check a connection, trigger a sync or scan | — |

Rule of thumb: if a button in the UI produces a result, an agent must be able to call one operation and receive the same result. Reference: `botSimulator.getLink` (`features/bot-simulator/api/public.ts`; the UI and API both call `createBotSimulatorLink` in the feature's `lib/`). Essentials: return data (ids, URLs, JSON), never a screen; one implementation shared by UI and API; point at the source of every input id in `.describe()`; key = verb + noun; `GET` only when it reads/computes, `POST` when it sends, runs automation, calls a paid model or spends quota (`read_only` tokens are GET/HEAD only). Full list and sample: `references/result-returning.md`.

## Procedure chain

```
authorizedAPI
  .route({ method, path, summary, tags })  → OpenAPI metadata
  .input(zodSchema)                         → request validation
  .use(middleware, mapperFn)                 → per-procedure middleware (optional)
  .output(zodSchema)                        → response validation (optional)
  .handler(async ({ input, context }) => {})→ business logic
```

## Feature API structure

`features/<x>/api/public.ts` is **required**; `private.ts` + `index.ts` exist only if the UI needs session-authed procedures. Public procedures are NOT spread into `api/index.ts`; mount them in `routers/public.ts`, nested under the resource name. A feature with no private procedures has no `api/index.ts` and is not in `routers/index.ts`.

## Registering the router

- Private: `apps/builder/src/routers/index.ts` as a **lazy branch** (`lazy(() => import("@/features/x/api").then((m) => ({ default: m.xAPI })))`). Keep the specifier a literal string; the picked export name must match, or you get `default: undefined` at first call, not at build time. Dynamic `import()` is fine here (builder is Next-built).
- Public: `apps/builder/src/routers/public.ts`, **eager** plain imports (feeds `/api/public-spec.json`; `operationId` `resource.key` becomes the MCP tool name).

Snippets: `references/router-registration.md`.

## Traps (public procedures)

- **Key naming**: CRUD uses `list/get/create/update/delete`; otherwise verb + secondary noun. Never prefix with the resource name or an auth suffix.
- **`summary` is the MCP tool description** (joined with `description`); put usage guidance for LLMs in `description`.
- **Every body-less mutation (DELETE) sets `successStatus: 204`**; if it returns data add `.output(...)` instead. Enforced by `apps/builder/__tests__/public-spec-operations.test.ts`.
- **`mcpSpec`** (`@/lib/orpc/mcp-annotations`) must be passed as the function form of `.route({ spec })`, never a plain object. Omitting `visibility` means `"hidden"` (only via `search_tools`/`call_tool`); only ~40 operations opt in with `"default"`.
- **`.errors()` is mandatory on public routes**: pick one `possibleErrorsOn*Resource` set by what the handler can fail with; never re-declare a `commonApiErrors` code. A new `ChatbotXException` code needs a matching entry or it silently drops from the spec.
- Split `api/public.ts` / `schema/public.ts` past ~400 lines; a submodule uses `workspaceTokenAuthAPIForScope` with **its own** scope. Prefer a sibling feature's own `api/public.ts` over a submodule.
- Heavy list endpoints may accept `include?: string[]` and `withCount?: boolean`.

Details and samples: `references/public-procedures.md`.

## Errors and logging

Throw `ChatbotXException` (`@chatbotx.io/business/errors`) or `ModelNotfoundException` (`@chatbotx.io/database/errors`); `mapKnownOrpcErrors` (`apps/builder/src/orpc.ts`) remaps them for all three stacks. Unknown errors are logged once by `logUnexpectedOrpcErrorCallback` (`lib/orpc/handlers.ts`). Server code (handlers, actions, queries) logs through pino, never `console`: `const logger = baseLogger.child({ feature: "myFeature" })` from `@chatbotx.io/logger`, then `logger.error({ err: error }, "[myFeature] operation failed")`. The key is `err`, not `error` (invariant 20).

## References

- `references/procedure-patterns.md`: read when writing a first procedure or a public/private pair sharing one service.
- `references/result-returning.md`: read when building a link/preview/test/stats/export/generate operation.
- `references/public-procedures.md`: read for `public.ts` samples, 204 deletes, `mcpSpec`, `include`/`withCount`, splitting.
- `references/router-registration.md`: read when wiring a router into `routers/index.ts` or `routers/public.ts`.
- `references/schemas-and-client.md`: read for Zod schema layout and for `useQuery`/`client.*`/SSR call patterns.
- `references/error-handling.md`: read when throwing errors or declaring `.errors()` sets.
- UI side (page, forms, actions, TanStack hooks): `../feature-scaffold/SKILL.md`.
