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

ChatbotX is a pnpm workspace + Turborepo monorepo. The authoritative layout table is
**`AGENTS.md` → "Repository layout"** — read it there rather than trusting a second copy.
To see what actually exists right now:

```bash
ls apps packages integrations
```

## Skill Router

The canonical task → skill routing table is **`CLAUDE.md` → "Skill → task mapping"**. Read
it and pick the skill that matches the task; it lists every skill in `.agents/skills/`.

Two routing notes that table does not spell out:

- CLI, MCP server, and the generated public client all follow the public oRPC surface — use
  `orpc-api`.
- A broad request usually decomposes into several skills (e.g. a new feature with a table and
  a queue = `feature-scaffold` + `drizzle-database` + `worker-development`). Read each before
  writing that layer, not all of them up front.

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
