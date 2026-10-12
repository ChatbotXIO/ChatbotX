---
trigger: always_on
description: ChatbotX load-bearing invariants and conventions mirrored from AGENTS.md.
---

# ChatbotX — Project Invariants & Conventions

> The shared invariant block below is generated from `AGENTS.md`. Do not edit the generated section directly.

## Stack

pnpm workspaces + Turborepo · TypeScript 5 · React 19 · Next.js 16 (builder) · Drizzle ORM + PostgreSQL (pgvector) · Redis + BullMQ · Ultracite (Biome) lint. **Drizzle only — never Prisma.**

## Non-obvious invariants

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

## Workflow

- After any change: `pnpm lint` + `pnpm --filter <app> check-types`. Use `pnpm fix`, never hand-format.
- Read the matching skill in `.agents/skills/` before new feature/API/table/worker/integration work.
- Git: stage specific files only (never `git add -A`); never commit `.env`/secrets; PR base is `main`.
