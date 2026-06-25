---
trigger: always_on
description: ChatbotX load-bearing invariants and conventions, mirrored from the canonical AGENTS.md.
---

# ChatbotX — Project Invariants & Conventions

> Canonical source: `AGENTS.md` (read it for full detail). This file mirrors the load-bearing invariants so editor/Devin agents don't fly blind. If this drifts from `AGENTS.md`, `AGENTS.md` wins.

## Stack
pnpm workspaces + Turborepo · TypeScript 5 · React 19 · Next.js 16 (builder) · Drizzle ORM + PostgreSQL (pgvector) · Redis + BullMQ · Ultracite (Biome) lint. **Drizzle only — never Prisma.**

## Non-obvious invariants (these break silently; the linter won't catch them)
1. **Triple-d middleware names** — use `workspaceAuthorizedMidddleware` / `workspaceTokenAuthMidddleware` (three `d`s, preserved typo).
2. **`relations/index.ts` needs TWO edits** when adding a table — `import` the relations file AND spread it into the `relations` object.
3. **`ChannelType` cascade** — adding a `channelTypes` value breaks every `Record<ChannelType, …>`; grep and fix all.
4. **`.bind()` with `bindArgsSchemas`** — call `.bind(null, workspaceId)` when wiring such actions to `useHookFormAction`/`useAction`.
5. **`execute()` on no-input actions** — call `execute()` with no args (not `execute({})`).
6. **i18n is mandatory** — no hardcoded user-facing strings; use `useTranslations()`; check `apps/builder/messages/en.json` → `fields.*` first.
7. **No direct `db` in `apps/` or `integrations/`** — go through a service (`@chatbotx.io/business`) or repository (`@chatbotx.io/database/repositories`). See `.agents/rules/data-access.md`.
8. **No dynamic `import()`** — it breaks the tsdown build. See `.agents/rules/no-dynamic-import.md`.
9. **New workspace package** — run `CI=true pnpm install --no-frozen-lockfile` to link it.
10. **Cloud signup stamps a bootstrap quota row.** On the cloud edition, `onUserCreated` synchronously writes a conservative `UserQuota` trial row (`ensureBootstrapPlan`) before enqueuing `publishEntitlements`. Don't assume a new cloud user has *no* quota row during the worker-sync gap, and don't treat the OSS layer as read-only for plan identity at signup. The private `quota-worker` remains the authority and re-anchors the row on its run.

## Workflow
- After any change: `pnpm lint` + `pnpm --filter <app> check-types`. Use `pnpm fix`, never hand-format.
- Read the matching skill in `.agents/skills/` before new feature/API/table/worker/integration work.
- Git: stage specific files only (never `git add -A`); never commit `.env`/secrets; PR base is `main`.
