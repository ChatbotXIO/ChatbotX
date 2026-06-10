# AGENTS.md — Context for AI assistants

This file summarizes how **ChatbotX** (this repository) is structured and how to work in it safely and consistently. Prefer it as a map; read adjacent code and `.agents/skills/*` for deep dives.

## What this project is

- **Product:** Open-source omnichannel chatbot platform (inbox, flow builder, AI agents, broadcasts, webhooks, public APIs, CLI, MCP).
- **Architecture:** **pnpm** workspaces + **Turborepo**. Shared packages use the **`@chatbotx.io/*`** npm scope.
- **License:** Community Edition is **AGPLv3**; enterprise-specific code may fall under a separate commercial license (see `apps/builder/src/enterprise/LICENSE`).

## Requirements

- **Node.js** >= 24
- **pnpm** 10.x (see root `package.json` `packageManager`)

## Repository layout

| Path | Role |
|------|------|
| `apps/builder` | **Next.js** web app (product UI). Default dev URL often `http://localhost:3123` (see `.env.example`). |
| `apps/worker` | **BullMQ** (and related) background jobs: chat, AI, triggers, webhooks, analytics, sequences. |
| `apps/realtime` | Realtime server; builder exposes `NEXT_PUBLIC_REALTIME_URL` (e.g. `http://localhost:1999`). |
| `apps/cli` | Command-line client (`chatbotx-cli`). |
| `apps/mcp-server` | MCP server exposing public API surfaces. |
| `packages/*` | Shared libraries: `database` (Drizzle + PostgreSQL), `ui`, `public-apis`, `sdk`, `worker-config`, `ai`, etc. |
| `integrations/*` | Channel and vendor integrations (WhatsApp, Messenger, Telegram, Zalo, webchat, SMTP, OpenAI, Google Sheets, …). |

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

### Workers & queues

- Job types and queues: **`packages/worker-config`** and **`apps/worker`**. Use **worker-development** skill when adding consumers or schedulers.

### Channel integrations

- **New or changed channels:** `integrations/<channel>/` and the **integration-channel** skill. Respect webhook send/receive patterns already used by sibling integrations.

### Dependencies

- Add deps with **`pnpm add <pkg> --filter <workspace>`**. Import internal packages via their **`exports`** (e.g. `@chatbotx.io/database/client`).

## Project-specific AI guidance

- **Windsurf rules:** `.windsurf/rules/` (Next.js conventions, Ultracite standards).
- **Agent skills (detailed runbooks):** `.agents/skills/` — notably `turborepo-workflow`, `feature-scaffold`, `orpc-api`, `drizzle-database`, `integration-channel`, `worker-development`.
- **Test placement:** use `<workspace>/__tests__/` for app/package/integration-level tests, especially tests covering actions, routes, API behavior, cache behavior, worker behavior, or multiple feature boundaries (e.g. `apps/builder/__tests__`, `apps/worker/__tests__`, `packages/sdk/__tests__`, `integrations/messenger/__tests__`). Use colocated `src/**/__tests__` only for narrow unit/component tests clearly owned by that module.
- **Quality bar:** Run `pnpm lint` (and typecheck scripts for touched packages) before considering work done. Keep changes scoped to the requested behavior.

## Key invariants for AI agents

These are the most common mistakes — read before writing any code:

1. **Triple-d middleware names** — The actual function names in code are `workspaceAuthorizedMidddleware` and `workspaceTokenAuthMidddleware` (three `d`s, not two). This is a known typo preserved for backward compat. Always use these exact names.

2. **`relations/index.ts` needs TWO edits** — When adding a new table, you must both `import` the new relations file AND spread it inside the `relations` object. Missing one breaks Drizzle's relational queries silently.

3. **`ChannelType` cascade** — Adding a value to `channelTypes` in `packages/database/src/partials/channel.ts` causes compile errors in every `Record<ChannelType, ...>` across the codebase. Grep for `Record<ChannelType` and fix all hits.

4. **`.bind()` with `bindArgsSchemas`** — Server actions that use `bindArgsSchemas` (e.g. for `workspaceId`) must be called with `.bind(null, workspaceId)` when passed to `useHookFormAction` or `useAction`. Without this, TypeScript throws a "too few arguments" error.

5. **New workspace packages** — After creating a new package, run `CI=true pnpm install --no-frozen-lockfile` to link it. Without `CI=true` the command hangs waiting for TTY input.

6. **`execute()` on no-input actions** — Delete actions use `bindArgsSchemas` only (no `.inputSchema()`). Call `execute()` with no arguments, not `execute({})`.

7. **i18n is mandatory** — All user-facing strings must use `useTranslations()`. Never hardcode labels, placeholders, or button text. Check `apps/builder/messages/en.json` → `fields.*` before creating new translation keys.

8. **`docs/tech-stack.md` is authoritative** — If you see references to Prisma anywhere in older docs, those are stale. This project uses Drizzle ORM exclusively.

9. **No direct `db` in app layer** — Code in `apps/` and `integrations/` must NOT import `db` from `@chatbotx.io/database/client`. All database access goes through a service (`packages/business/`) or repository (`packages/database/src/repositories/`). Existing direct imports are legacy exceptions. See `.agents/rules/data-access.md`.

## Git conventions

See **`.agents/rules/git.md`** for the full canonical rules (commit format, branch naming, staging, PRs, changelog).

## Docs and support links

- Human-facing docs: [chatbotx.io/docs](https://chatbotx.io/docs) (including Quick Start).
- Tech stack details: `docs/tech-stack.md`
- Request flow diagrams: `docs/request-workflow.md`

When unsure, search the codebase for an existing feature that resembles the request and mirror its structure, imports, and error-handling style.
