# AGENTS.md — Context for AI assistants

This file summarizes how **ChatbotX** (this repository) is structured and how to work in it safely and consistently. Prefer it as a map; read adjacent code and `.agents/skills/*` for deep dives.

## What this project is

- **Product:** Open-source omnichannel chatbot platform (inbox, flow builder, AI agents, broadcasts, webhooks, public APIs, CLI, MCP).
- **Agent-first:** the primary user is an **AI agent** driving the product through the public API, the CLI, and the MCP server. The web UI is a secondary client of the same capabilities. A feature that exists only in the UI is invisible to agents — see invariant 23.
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
| `apps/cli`        | Command-line client (`chatbotx`).                                                                                       |
| `apps/mcp-server` | MCP server exposing public API surfaces.                                                                                |
| `apps/javascript-executor` | Internal HTTP service that executes flow-step JavaScript in isolated-vm.                                      |
| `packages/*`      | Shared libraries: `database` (Drizzle + PostgreSQL), `ui`, `sdk`, `worker-config`, `ai`, etc.            |
| `integrations/*`  | Channel and vendor integrations (WhatsApp, Messenger, Instagram, Threads, Telegram, Zalo, TikTok, webchat, SMTP, OpenAI, Google Sheets, …). |

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
pnpm lint             # check:agent-instructions → check:invariants → turbo run lint → ultracite check
pnpm fix              # ultracite fix --unsafe
pnpm test             # turbo run test (vitest, --passWithNoTests per workspace)
pnpm test:coverage    # turbo run test -- --coverage
pnpm sync:agent-instructions   # regenerate the .devin/ + .github/ invariant mirrors
pnpm check:circular   # madge circular deps
pnpm check:unused     # knip
```

Targeted examples:

```bash
pnpm --filter builder dev
pnpm --filter worker dev
pnpm --filter realtime dev
pnpm --filter chatbotx dev:cli
pnpm --filter chatbotx-mcp dev:mcp
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

Optional CodeGraph code index for AI editors: setup in `docs/developer/codegraph.md`.

## Where to change what

### Builder (Next.js app)

- **Feature modules** live under `apps/builder/src/features/<feature-name>/` with optional `actions/`, `api/`, `queries/`, `schema/`, `components/`, etc. (server actions, oRPC handlers, Zod, queries).
- **Pages:** `apps/builder/src/app/...` — async Server Components; `params` / `searchParams` are **Promises** (Next.js 16 / React 19 style).
- **oRPC:** RPC + OpenAPI from the builder; auth stacks and middleware live around `apps/builder/src/orpc.ts` and `apps/builder/src/middlewares/`. Feature APIs often colocate under each feature’s `api/` folder.
- **Public / unauthenticated routes:** implement as route handlers under `app/`, and register prefixes in `apps/builder/src/proxy.ts` (`publicRoutes`) so middleware does not force sign-in.
- **Client-side server data:** TanStack Query via `@/lib/orpc/query` (`orpc.<router>.<proc>.queryOptions()`); zustand `provider/` stores are for client-only state. See `feature-scaffold` skill.

### API surface

- Prefer existing **oRPC** patterns (`authorizedAPI`, workspace token APIs, zod input/output, OpenAPI `.route()` metadata). Extend routers by composition; avoid ad-hoc REST unless the codebase already does.

### Database

- Schema and migrations: **`packages/database`** (Drizzle). Use the **drizzle-database** skill in `.agents/skills/drizzle-database/SKILL.md` for migrations and query patterns.
- **Migration safety:** Never run or apply `db:migrate` automatically. Generate and inspect migration SQL when needed, then wait for explicit user approval before applying it. This applies even when a plan lists `db:migrate` as a verification step.
- **Drift guard:** `db:check-drift` (run by `pnpm lint`) fails when `src/schema` and the migration snapshots disagree.
- **Database-backed tests (opt-in):** `pnpm --filter @chatbotx.io/database test:db`; they skip themselves under plain `pnpm test`.
- **A drizzle `.default()` is not proof of a database default.** 19 columns have a TypeScript default but no database default; they are pinned in `packages/database/__tests__/integration/schema-default-parity.test.ts`, and every insert path for one of them must write the value explicitly.

### Workers & queues

- Job types and queues: **`packages/worker-config`** and **`apps/worker`**. Use **worker-development** skill when adding consumers or schedulers.

### Channel integrations

- **New or changed channels:** `integrations/<channel>/` and the **integration-channel** skill. Respect webhook send/receive patterns already used by sibling integrations.

### Business logic

- Any DB read/write from app code, a new service method, or shared validation/cache/event logic: **`packages/business`**. The chain is `action | API handler → service → repository → DB` — app code calls a service, never `db` directly. Use the **business-data-access** skill.

### Dependencies

- Add deps with **`pnpm add <pkg> --filter <workspace>`**. Import internal packages via their **`exports`** (e.g. `@chatbotx.io/database/client`).

## Project-specific AI guidance

- **Rules (always apply):** `.agents/rules/` — `data-access.md` (no direct `db` in app layer), `git.md` (commit/PR/staging), `no-dynamic-import.md` (dynamic `import()` breaks the tsdown build — applies to `packages/*`, `integrations/*`, `apps/{worker,cli,mcp-server,javascript-executor}`; allowed in `apps/builder`).
- **Per-tool rule mirrors:** `.devin/rules/chatbotx.md` and the ChatbotX section in `.github/copilot-instructions.md` receive generated copies of the shared invariants below. **This file (`AGENTS.md`) is canonical**; run `pnpm sync:agent-instructions` after changing them.
- **Agent skills (detailed runbooks):** `.agents/skills/<name>/SKILL.md`. Read the skill for a task **before** writing code for it. The canonical task → skill routing table is in `CLAUDE.md` ("Skill → task mapping") — it is the single inventory; do not maintain a second list here.
- **Specialist subagents:** `.claude/agents/` — `invariant-guard` (post-edit invariant check), `rag-eval` (retrieval/tenant scoping), `incident-responder` (prod triage). General reviewers/planners come from the `~/.claude/` global set.
- **Test placement:** use `<workspace>/__tests__/` for app/package/integration-level tests, especially tests covering actions, routes, API behavior, cache behavior, worker behavior, or multiple feature boundaries (e.g. `apps/builder/__tests__`, `apps/worker/__tests__`, `packages/sdk/__tests__`, `integrations/messenger/__tests__`). Use colocated `src/**/__tests__` only for narrow unit/component tests clearly owned by that module.
- **Quality bar:** Run `pnpm lint` (and typecheck scripts for touched packages) before considering work done. Keep changes scoped to the requested behavior.

## Key invariants for AI agents

One line each; the full text (reasons, file paths, edge cases) is in `docs/agents/invariants.md`. Read the matching entry before changing code on that surface.

<!-- BEGIN GENERATED: SHARED-INVARIANTS -->
1. **Triple-d middleware names** — `workspaceAuthorizedMidddleware` and `workspaceTokenAuthMidddleware` have three `d`s (a typo kept for backward compat). Use these exact names.

2. **New table → two edits in `relations/index.ts`** — import the relations file AND spread it into the `relations` object (lint-checked).

3. **`ChannelType` cascade** — adding a value to `channelTypes` (`packages/utils/src/channel.ts`) breaks every `Record<ChannelType, ...>`; grep `Record<ChannelType` and fix all hits.

4. **Bind `bindArgsSchemas` actions** — pass them to `useHookFormAction`/`useAction` as `.bind(null, workspaceId)`.

5. **New workspace package** — link it with `CI=true pnpm install --no-frozen-lockfile` (without `CI=true` it hangs on a TTY prompt).

6. **No-input actions** — call `execute()` with no arguments, not `execute({})`.

7. **i18n is mandatory** — every user-facing string goes through `useTranslations()`; check `apps/builder/messages/en.json` → `fields.*` before adding a key.

8. **Drizzle only** — `docs/tech-stack.md` is authoritative; any Prisma reference is stale (lint-checked).

9. **The chain is `action | API handler → service → repository → DB`** — code in `apps/` and `integrations/` never imports `db` (lint-checked); it calls a service in `packages/business/`. The public and private paths for one resource call the same service method, passing the caller's scope as plain data. See `.agents/rules/data-access.md`.

10. **White-label tenancy** — derive a new workspace's `tenantId` from its owner (`workspaceService.resolveTenantForOwner`), never from request or client input; `User` email is unique per tenant. See `docs/tenancy.md`.

11. **Cloud signup writes a bootstrap `UserQuota` trial row** (`ensureBootstrapPlan`) before `publishEntitlements`, so a new cloud user always has a quota row.

12. **Quota is single-source** — the owner's `UserQuota` row is the tenant pool; extend `UserQuotaService`, never add a separate counter table.

13. **Keep client method binding** — wrap instance methods in an arrow (`get: (endpoint, options) => client.get(endpoint, options)`), never pass `client.get` bare.

14. **Trial-expired workspaces are read/delete-only** — actions that must still work after expiry (delete, disconnect, cancel) use `workspaceActionClientAllowExpired`.

15. **Workspace-scoped workers use `withBlockedOwnerGuard`** — a blocked owner is a bare `return`, so the job neither retries nor dead-letters.

16. **New flow node type** — register its schema in every node map (`flowVersionSchema`, `allNodesConfig`, `allSteps`, `viewerNodeTypes`, `analyticsNodeTypes`); a miss fails silently. Reuse `flowVersionSchema`/`publishFlowSchema`, never hand-list node schemas.

17. **One table, several `FolderType`s** — thread the discriminator into `FolderService.changeFolder`'s where-clause, as Keywords (`AutomatedResponse`) does.

18. **Channel visibility (`Tenant.hiddenChannels`) is a UI gate, not authorization** — gate through `resolveChannelPolicy`/`requireVisibleChannel` with the tenant-aware owner, and keep already-connected channels visible.

19. **Support access is a synthetic membership** — every membership gate routes through `resolveWorkspaceAccess`; it never writes a `WorkspaceMember` row. See `docs/support-access.md`.

20. **Structured logging** — server code logs through the pino logger, never `console`, and logs errors as `{ err: error }` (lint-checked).

21. **TanStack Query mutations invalidate** — every create/update/delete/toggle/move calls the resource's invalidator (or `setQueryData`) before `router.push`; `router.refresh()` does not touch the query cache.

22. **`ContactInboxPost` has no FK and is partitioned by `workspaceId`** — delete through `contactInboxPostService`, filter every query by `workspaceId`, and hold the workspace purge guard on writes.

23. **Agent-first: every feature ships a public API** — each new feature or operation, including result-returning ones (link, preview, test run, stats, export, AI generation), adds a procedure to `features/<x>/api/public.ts` first, then the UI; both call the same function. Then run the `cli-mcp-docs` skill. Exemptions are listed in the full reference.
<!-- END GENERATED: SHARED-INVARIANTS -->

## Git conventions

See **`.agents/rules/git.md`** for the full canonical rules (commit format, branch naming, staging, PRs, changelog).

## Docs and support links

- Human-facing docs: [chatbotx.io/docs](https://chatbotx.io/docs) (including Quick Start).
- Tech stack details: `docs/tech-stack.md`
- Architecture decisions: `docs/adr/`
- Messaging scaling runbook: `docs/scaling-messaging.md`
- Request flow diagrams: `docs/request-workflow.md`
- White-label tenancy model: `docs/tenancy.md`
- Workspace API tokens (hashing, scopes, `{{api_key}}` default token): `docs/developer/workspace-api-tokens.md`
- Ads conversion tracking (CTWA/CTM/CTID, rules vs Trigger actions, CAPI): `docs/ads-conversion-tracking.md`
- Google Ads Click-to-Message conversion tracking: `docs/google-ads-conversion-tracking.md`
- Google Ads conversion options for admins: `docs/google-ads-conversion-options-admin-guide.md`
- Comment automation (all channels): `docs/comment-automation.md` (skill: `.agents/skills/comment-automation/`)
- Push notifications (Expo Push Service, device tokens): `docs/push-notifications.md`
- Enterprise licensing (offline Ed25519 license keys): `docs/licensing.md`
- Platform support access (super admin opening any workspace): `docs/support-access.md`
- Automatic Customer Scan (contact import from channel history): `docs/contact-scan.md`
- WhatsApp Conversation Routing (thread control with Meta AI / other partners): `docs/whatsapp-conversation-routing.md`

When unsure, search the codebase for an existing feature that resembles the request and mirror its structure, imports, and error-handling style.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
