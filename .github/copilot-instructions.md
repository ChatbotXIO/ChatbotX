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
