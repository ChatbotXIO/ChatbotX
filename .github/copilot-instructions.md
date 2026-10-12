# ChatbotX Repository Instructions

These instructions apply repository-wide. Read the relevant detailed rule in `.agents/rules/` and skill in `.agents/skills/` before making specialized changes.

## Project context

- ChatbotX is a pnpm workspace + Turborepo monorepo.
- The builder is Next.js 16 with React 19; persistence uses Drizzle ORM and PostgreSQL; workers use BullMQ and Redis.
- Application and integration code must follow the service/repository boundaries described in `.agents/rules/data-access.md`.

## Required workflow

- Inspect nearby code and an existing analogous feature before changing architecture or behavior.
- Use `pnpm lint` after changes. Use `pnpm fix` for formatting fixes.
- Run the relevant workspace `check-types` and tests before reporting completion.
- Do not commit secrets, and stage specific files only.

## Critical project invariants

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

## Rule index

- Data access: `.agents/rules/data-access.md`
- Git and pull requests: `.agents/rules/git.md`
- Static imports: `.agents/rules/no-dynamic-import.md`
- Feature, API, database, integration, worker, and testing workflows: `.agents/skills/`

## Common commands

```bash
pnpm lint
pnpm --filter builder check-types
pnpm --filter @chatbotx.io/database check-types
pnpm --filter worker test
pnpm build
```
