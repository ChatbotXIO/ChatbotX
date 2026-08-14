# AGENTS.md — Context for AI assistants

This file summarizes how **ChatbotX** (this repository) is structured and how to work in it safely and consistently. Prefer it as a map; read adjacent code and `.agents/skills/*` for deep dives.

## What this project is

- **Product:** Open-source omnichannel chatbot platform (inbox, flow builder, AI agents, broadcasts, webhooks, public APIs, CLI, MCP).
- **Architecture:** **pnpm** workspaces + **Turborepo**. Shared packages use the **`@chatbotx.io/*`** npm scope.
- **License:** Community Edition is **MIT**; enterprise-specific code may fall under a separate commercial license (see `apps/builder/src/enterprise/LICENSE`).

## Requirements

- **Node.js** >= 24
- **pnpm** 10.x (see root `package.json` `packageManager`)

## Repository layout

| Path              | Role                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/builder`    | **Next.js** web app (product UI). Default dev URL often `http://localhost:3123` (see `.env.example`).                   |
| `apps/worker`     | **BullMQ** (and related) background jobs: chat, AI, triggers, webhooks, analytics, sequences.                           |
| `apps/realtime`   | Realtime server; builder exposes `NEXT_PUBLIC_REALTIME_URL` (e.g. `http://localhost:1999`).                             |
| `apps/cli`        | Command-line client (`chatbotx-cli`).                                                                                   |
| `apps/mcp-server` | MCP server exposing public API surfaces.                                                                                |
| `apps/javascript-executor` | Internal HTTP service that executes flow-step JavaScript in isolated-vm.                                      |
| `packages/*`      | Shared libraries: `database` (Drizzle + PostgreSQL), `ui`, `public-apis`, `sdk`, `worker-config`, `ai`, etc.            |
| `integrations/*`  | Channel and vendor integrations (WhatsApp, Messenger, Telegram, Zalo, TikTok, webchat, SMTP, OpenAI, Google Sheets, …). |

## Stack (high level)

- **TypeScript 5**, **React 19**, **Next.js 16** (builder)
- **Drizzle ORM** + **PostgreSQL** (with **pgvector**)
- **Redis** + **BullMQ** for queues
- **S3-compatible** storage (e.g. RustFS locally via Docker)
- Lint/format: **Ultracite** (Biome)

## Commands (root)

```bash
pnpm dev              # turbo dev — all dev tasks the repo wires up
pnpm build            # turbo build
pnpm lint             # ultracite lint
pnpm fix              # ultracite fix --unsafe
pnpm check:circular   # madge circular deps
pnpm check:unused     # knip
```

Targeted examples:

```bash
pnpm --filter builder dev
pnpm --filter worker dev
pnpm --filter realtime dev
pnpm --filter chatbotx-cli dev:cli
pnpm --filter chatbotx-mcp-server dev:mcp
pnpm --filter @chatbotx.io/database db:studio
```

Database migrations and setup (typical):

```bash
pnpm --filter @chatbotx.io/database db:migrate
pnpm --filter @chatbotx.io/database db:setup   # migrate + seed when applicable
pnpm --filter @chatbotx.io/database make:migration <name>
```

## Local infrastructure

- **Docker Compose** provides PostgreSQL, Redis, object storage, MailHog, Adminer, and RedisInsight services. See `docker-compose.yml` and project docs.
- Copy **`.env.example`** → **`.env`** (or per-app env as documented). Never commit secrets.

### CodeGraph (optional, for AI editors)

The repo ships MCP config for [CodeGraph](https://github.com/codegraph-ai/codegraph), a local code-intelligence index that lets Claude Code and Cursor answer "how does X work" without grepping. **Entirely optional** — if you don't use an AI editor, ignore this section; the config files are inert.

To enable it, install the CLI once per machine (it is not a workspace dependency), then build the index from the repo root:

```bash
codegraph index
```

The index lives in `.codegraph/` and is **per-machine** — the directory self-ignores via its own `.gitignore`, so the multi-hundred-MB database never reaches git. Re-running `index` after a large rebase keeps it fresh; a file watcher handles incremental edits.

Committed config: `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor) both point at the `codegraph` binary on your `PATH`, plus `.claude/settings.json` pre-allows the MCP tools.

For automatic context injection on every prompt, add the hook to your **own** `.claude/settings.local.json` (gitignored, so it stays off other machines):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "codegraph prompt-hook" }] }
    ]
  }
}
```

## Where to change what

### Builder (Next.js app)

- **Feature modules** live under `apps/builder/src/features/<feature-name>/` with optional `actions/`, `api/`, `queries/`, `schema/`, `components/`, etc. (server actions, oRPC handlers, Zod, queries).
- **Pages:** `apps/builder/src/app/...` — async Server Components; `params` / `searchParams` are **Promises** (Next.js 16 / React 19 style).
- **oRPC:** RPC + OpenAPI from the builder; auth stacks and middleware live around `apps/builder/src/orpc.ts` and `apps/builder/src/middlewares/`. Feature APIs often colocate under each feature’s `api/` folder.
- **Public / unauthenticated routes:** implement as route handlers under `app/`, and register prefixes in `apps/builder/src/proxy.ts` (`publicRoutes`) so middleware does not force sign-in.

### API surface

- Prefer existing **oRPC** patterns (`authorizedAPI`, workspace token APIs, zod input/output, OpenAPI `.route()` metadata). Extend routers by composition; avoid ad-hoc REST unless the codebase already does.

### Database

- Schema and migrations: **`packages/database`** (Drizzle). Use the **drizzle-database** skill in `.agents/skills/drizzle-database/SKILL.md` for migrations and query patterns.
- **Migration safety:** Never run or apply `db:migrate` automatically. Generate and inspect migration SQL when needed, then wait for explicit user approval before applying it. This applies even when a plan lists `db:migrate` as a verification step.

### Workers & queues

- Job types and queues: **`packages/worker-config`** and **`apps/worker`**. Use **worker-development** skill when adding consumers or schedulers.

### Channel integrations

- **New or changed channels:** `integrations/<channel>/` and the **integration-channel** skill. Respect webhook send/receive patterns already used by sibling integrations.

### Dependencies

- Add deps with **`pnpm add <pkg> --filter <workspace>`**. Import internal packages via their **`exports`** (e.g. `@chatbotx.io/database/client`).

## Project-specific AI guidance

- **Rules (always apply):** `.agents/rules/` — `data-access.md` (no direct `db` in app layer), `git.md` (commit/PR/staging), `no-dynamic-import.md` (dynamic `import()` breaks the tsdown build — applies to `packages/*`, `integrations/*`, `apps/{worker,cli,mcp-server,javascript-executor}`; allowed in `apps/builder`).
- **Per-tool rule mirrors:** `.devin/rules/chatbotx.md` and the ChatbotX section in `.github/copilot-instructions.md` receive generated copies of the shared invariants below. **This file (`AGENTS.md`) is canonical**; run `pnpm sync:agent-instructions` after changing them.
- **Agent skills (detailed runbooks):** `.agents/skills/` — notably `turborepo-workflow`, `feature-scaffold`, `orpc-api`, `drizzle-database`, `integration-channel`, `worker-development`, `contact-filter`, plus `security-review`, `testing-workflow`, `reliability-concurrency`.
- **Specialist subagents:** `.claude/agents/` — `invariant-guard` (post-edit invariant check), `rag-eval` (retrieval/tenant scoping), `incident-responder` (prod triage). General reviewers/planners come from the `~/.claude/` global set.
- **Test placement:** use `<workspace>/__tests__/` for app/package/integration-level tests, especially tests covering actions, routes, API behavior, cache behavior, worker behavior, or multiple feature boundaries (e.g. `apps/builder/__tests__`, `apps/worker/__tests__`, `packages/sdk/__tests__`, `integrations/messenger/__tests__`). Use colocated `src/**/__tests__` only for narrow unit/component tests clearly owned by that module.
- **Quality bar:** Run `pnpm lint` (and typecheck scripts for touched packages) before considering work done. Keep changes scoped to the requested behavior.

## Key invariants for AI agents

These are the most common mistakes — read before writing any code:

<!-- BEGIN GENERATED: SHARED-INVARIANTS -->
1. **Triple-d middleware names** — The actual function names in code are `workspaceAuthorizedMidddleware` and `workspaceTokenAuthMidddleware` (three `d`s, not two). This is a known typo preserved for backward compat. Always use these exact names.

2. **`relations/index.ts` needs TWO edits** — When adding a new table, you must both `import` the new relations file AND spread it inside the `relations` object. Missing one breaks Drizzle's relational queries silently.

3. **`ChannelType` cascade** — Adding a value to `channelTypes` in `packages/database/src/partials/channel.ts` causes compile errors in every `Record<ChannelType, ...>` across the codebase. Grep for `Record<ChannelType` and fix all hits.

4. **`.bind()` with `bindArgsSchemas`** — Server actions that use `bindArgsSchemas` (e.g. for `workspaceId`) must be called with `.bind(null, workspaceId)` when passed to `useHookFormAction` or `useAction`. Without this, TypeScript throws a "too few arguments" error.

5. **New workspace packages** — After creating a new package, run `CI=true pnpm install --no-frozen-lockfile` to link it. Without `CI=true` the command hangs waiting for TTY input.

6. **`execute()` on no-input actions** — Delete actions use `bindArgsSchemas` only (no `.inputSchema()`). Call `execute()` with no arguments, not `execute({})`.

7. **i18n is mandatory** — All user-facing strings must use `useTranslations()`. Never hardcode labels, placeholders, or button text. Check `apps/builder/messages/en.json` → `fields.*` before creating new translation keys.

8. **`docs/tech-stack.md` is authoritative** — If you see references to Prisma anywhere in older docs, those are stale. This project uses Drizzle ORM exclusively.

9. **No direct `db` in app layer** — Code in `apps/` and `integrations/` must NOT import `db` from `@chatbotx.io/database/client`. All database access goes through a service (`packages/business/`) or repository (`packages/database/src/repositories/`). Existing direct imports are legacy exceptions. See `.agents/rules/data-access.md`.

10. **White-label tenancy** — `User`/`Workspace` carry a `tenantId` that defaults to `ROOT_TENANT_ID` (`"1"`, the platform). `User` email is unique *per tenant* (`User_email_tenant_key`), never globally. Derive a new workspace's tenant via `workspaceService.resolveTenantForOwner` (owner-derived, never host-derived) — don't set `tenantId` from request input. Never accept or return `tenantId` from client input in auth: the tenant-scoped adapter stamps it from `getTenantId()`. See `docs/tenancy.md`.

11. **Cloud signup stamps a bootstrap quota row.** On the cloud edition, `onUserCreated` synchronously writes a conservative `UserQuota` trial row (`ensureBootstrapPlan`) before enqueuing `publishEntitlements`. Don't assume a new cloud user has *no* quota row during the worker-sync gap, and don't treat the OSS layer as read-only for plan identity at signup. The private `quota-worker` remains the authority and re-anchors the row on its run.

12. **Quota is single-source: the owner's `UserQuota` row IS the pool.** There is no separate `TenantQuotaUsage` table. For a reseller, the owner's `UserQuota.*Used` columns hold the aggregated usage across their entire tenant (owner's own resources carry the reseller `tenantId` so they are included automatically). Sub-accounts each have their own `UserQuota` row; enforcement gates both the sub-account's own row and the owner's pool row. Root-tenant users have only their own row — no pool. Never add a separate counter table for tenant-level usage; update `UserQuotaService` instead. See `docs/tenancy.md#quota-enforcement`.

13. **Preserve client method binding when passing callbacks** — Do not pass instance methods as bare references to helpers (for example `get: facebookGraphClient.get`). JavaScript loses the receiver binding, and clients may crash at runtime when the method uses `this`. Use an arrow wrapper or explicit bind, e.g. `get: (endpoint, options) => facebookGraphClient.get(endpoint, options)`.

14. **Trial-expired workspaces are read/delete-only, not redirected.** The persistent banner explains the state; use `workspaceActionClientAllowExpired` for delete, disconnect, cancel, and other actions that must remain available after expiry. `Workspace.scheduledDeletionAt` is the soft-delete convention: the hourly `purgeWorkspaces` cron disconnects integrations first, then hard-deletes after the 24-hour grace window.

15. **Workspace-scoped workers must use `withBlockedOwnerGuard`.** A blocked owner is a safe no-op with a bare `return`, so the job does not retry or dead-letter and webhook requests remain HTTP-200-safe. Excluded system/quota/tenancy jobs are `sendAuditLog`, `sendErrorLog`, and all schedule cron jobs except the two broadcast handlers. The trial+7d `unsubscribeExpiredTrials` teardown is one-shot via `UserQuota.channelsTornDownAt`.

16. **New flow node type cascade — grep for every registration surface.** Adding a value to `nodeTypeSchema` (`packages/flow-config/src/nodes/base.ts`) requires registering the new node schema in ALL node maps, and most fail SILENTLY (no compile error — the node doesn't render, or publish fails with a generic "flowConfigIncomplete" toast). Run `grep -rn "waitNodeSchema\|nodeTypeSchema.enum.wait" apps/ packages/` and mirror every hit: the `flowVersionSchema` union (`packages/flow-config/src/nodes/index.ts`), `allNodesConfig` (`nodes/node-config.tsx`), `allSteps` (`steps/index.tsx`), `viewerNodeTypes` (`react-flow-wrapper.tsx`), and `analyticsNodeTypes` (`node-types-config.ts`). Never hand-list node schemas in a new zod union — reuse `flowVersionSchema`/`publishFlowSchema` so client and server validation cannot drift.

17. **A `FolderType` shared by multiple discriminator values needs extra scoping in `changeFolder`.** `AutomatedResponse` (Keywords) has one table serving two `FolderType`s — `automatedResponse` (Contact/inbound) and `outboundAutomatedResponse` (Page/outbound) — disambiguated by a `type` column, both resolved to the same model in `FolderService.resolveResourceModel`. `FolderService.changeFolder` (`packages/business/src/folder/service.ts`) scopes its select/update only by `workspaceId` + `id`, so without an extra check it will happily move an inbound row into an outbound folder (or vice versa), silently breaking the "never share a folder namespace" invariant. Any resource added to `resolveResourceModel` that shares a table across more than one `FolderType` must add a matching entry to `automatedResponseTypeByFolderType` (or an equivalent map) and thread it into `changeFolder`'s where-clause — see how `packages/database/src/partials/automated-response.ts` does it for Keywords.

18. **Channel-visibility (`Tenant.hiddenChannels`) is a UI gate, not authorization.** The two-tier policy (`tenantService.resolveVisibleChannels`) only decides whether the create UI *renders* a channel — it is never consulted by webhooks, outbound send, or `Inbox`, so a hidden channel that is already connected keeps working. Three consequences that bite silently: (a) the connect **actions** (e.g. `connectTelegramAction`) deliberately do NOT re-check the policy — a hidden channel is still creatable by invoking its action directly; adding true blocking is an authorization change on the action, not a visibility change. (b) Any new enforcement surface must pass the **tenant-aware owner** from `resolvePlatformOwnerId`/`resolveOwnerForWorkspace` (`apps/builder/src/lib/platform-credential-owner.ts`, host wins over `workspaceId`) — pass a bare `userId` and the policy silently falls back to platform-global with no error. (c) The settings surface **grandfathers** already-connected channels (`inboxService.distinctConnectedChannels`); any new gate over `CREATABLE_CHANNELS` must preserve that so hiding never makes an existing connection disappear. The canonical gate is `resolveChannelPolicy`/`requireVisibleChannel` (`apps/builder/src/lib/workspace/`) — the channels layout and every `settings/channels/<channel>/page.tsx` route share its one cached resolution per request, so never hand-roll a separate visibility check that can drift from it. `smtp` (manageable but not creatable) sits outside the policy entirely. See `docs/tenancy.md#channel-visibility-policy`.
<!-- END GENERATED: SHARED-INVARIANTS -->

## Git conventions

See **`.agents/rules/git.md`** for the full canonical rules (commit format, branch naming, staging, PRs, changelog).

## Docs and support links

- Human-facing docs: [chatbotx.io/docs](https://chatbotx.io/docs) (including Quick Start).
- Tech stack details: `docs/tech-stack.md`
- Request flow diagrams: `docs/request-workflow.md`
- White-label tenancy model: `docs/tenancy.md`
- Facebook comment automation: `docs/fb-comment-automation.md` (skill: `.agents/skills/fb-comment-automation/`)
- Enterprise licensing (offline Ed25519 license keys): `docs/licensing.md`

When unsure, search the codebase for an existing feature that resembles the request and mirror its structure, imports, and error-handling style.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
