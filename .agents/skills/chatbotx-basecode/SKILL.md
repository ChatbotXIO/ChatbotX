---
name: chatbotx-basecode
description: >-
  Understand and audit the ChatbotX base code before making changes. Use when
  asked to scan the project, check architecture, locate ownership boundaries,
  onboard to the repository, or decide which project-specific skill should
  handle a task.
---

# ChatbotX Basecode

Use this skill as the first pass for broad or ambiguous requests. It is a map,
not a replacement for reading adjacent code.

## Project Shape

ChatbotX is a pnpm workspace + Turborepo monorepo.

```
apps/
  builder/     Next.js app: product UI, oRPC/OpenAPI, route handlers
  worker/      BullMQ/Kafka background jobs
  realtime/    PartyKit realtime server
  cli/         chatbotx-cli
  mcp-server/  MCP tools generated from OpenAPI

packages/
  business/       service layer and business orchestration
  database/       Drizzle schema, relations, repositories, migrations
  ui/             shared UI components
  public-apis/    typed public API client
  sdk/            integration contracts and shared schemas
  worker-config/  queue names, job payloads, BullMQ queues
  flow-config/    flow/node/step config schemas
  ai, events, redis, kafka, filesystem, mail, imports, analytics, ...

integrations/
  messenger, whatsapp, zalo, tiktok, telegram, webchat, smtp, openai, google-sheets, ...
```

## Skill Router

- Builder feature, page, action, query, or public route: use `feature-scaffold`.
- oRPC or OpenAPI endpoint: use `orpc-api`.
- Database schema, relations, migration, repository: use `drizzle-database`.
- Service layer, app data-access boundary: use `business-data-access`.
- UI component work, forms, tables, translations: use `builder-ui-i18n`.
- Worker, BullMQ, Kafka, scheduled job: use `worker-development`.
- Channel integration or webhook behavior: use `integration-channel`.
- Flow step or state-based routing: use `flow-step-development`.
- CLI, MCP server, generated public client: use `orpc-api`.
- Dev server, build, lint, package management: use `turborepo-workflow`.

## Basecode Scan Checklist

1. Read the nearest `package.json`, route/module files, and sibling features.
2. Identify the owning layer before editing — the chain is
   `action | API handler → service → repository → DB`:
   - UI/app orchestration (calls a service, never `db`): `apps/builder`
   - business rules, cache invalidation, events (calls a repository): `packages/business`
   - raw database queries, shard routing: `packages/database/src/repositories`
   - schema/migrations: `packages/database`
   - async processing (calls a service, never `db`): `apps/worker` + `packages/worker-config`
   - external channel protocol (calls a service, never `db`): `integrations/<channel>`
3. Search for a similar feature and mirror naming, imports, error handling, and tests.
4. Check `.agents/rules/*` for local invariants, especially data access and git.
5. Keep changes scoped to the user request; do not refactor legacy exceptions unless required.

## Non-Negotiable Invariants

- New app/integration code must not import `db` from `@chatbotx.io/database/client`.
- User-facing builder strings must use `useTranslations()` and message JSON keys.
- Next.js app pages use Promise `params` / `searchParams`.
- Public unauthenticated builder routes must be registered in `apps/builder/src/proxy.ts`.
- Middleware names intentionally contain three `d`s:
  `workspaceAuthorizedMidddleware` and `workspaceTokenAuthMidddleware`.
- Adding database tables requires schema, migration, relation import, and relation spread.
- Adding `ChannelType` values requires fixing every `Record<ChannelType, ...>` use.

## Validation

Prefer targeted checks first, then broader checks when the blast radius grows:

```bash
pnpm --filter builder check-types
pnpm --filter @chatbotx.io/database check-types
pnpm --filter worker test
pnpm lint
pnpm build
```

If the exact script is unclear, inspect the relevant workspace `package.json`.
