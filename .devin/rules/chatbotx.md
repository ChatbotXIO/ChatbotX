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

15. **Workspace-scoped workers must use `withBlockedOwnerGuard`.** A blocked owner is a safe no-op with a bare `return`, so the job does not retry or dead-letter and webhook requests remain HTTP-200-safe. Excluded system/quota/tenancy work is `sendAuditLog`, the `error-log:recorded` event-bus listener that records third-party failures, and all schedule cron jobs except the two broadcast handlers. The trial+7d `unsubscribeExpiredTrials` teardown is one-shot via `UserQuota.channelsTornDownAt`.

16. **New flow node type cascade — grep for every registration surface.** Adding a value to `nodeTypeSchema` (`packages/flow-config/src/nodes/base.ts`) requires registering the new node schema in ALL node maps, and most fail SILENTLY (no compile error — the node doesn't render, or publish fails with a generic "flowConfigIncomplete" toast). Run `grep -rn "waitNodeSchema\|nodeTypeSchema.enum.wait" apps/ packages/` and mirror every hit: the `flowVersionSchema` union (`packages/flow-config/src/nodes/index.ts`), `allNodesConfig` (`nodes/node-config.tsx`), `allSteps` (`steps/index.tsx`), `viewerNodeTypes` (`react-flow-wrapper.tsx`), and `analyticsNodeTypes` (`node-types-config.ts`). Never hand-list node schemas in a new zod union — reuse `flowVersionSchema`/`publishFlowSchema` so client and server validation cannot drift.

17. **A `FolderType` shared by multiple discriminator values needs extra scoping in `changeFolder`.** `AutomatedResponse` (Keywords) has one table serving two `FolderType`s — `automatedResponse` (Contact/inbound) and `outboundAutomatedResponse` (Page/outbound) — disambiguated by a `type` column, both resolved to the same model in `FolderService.resolveResourceModel`. `FolderService.changeFolder` (`packages/business/src/folder/service.ts`) scopes its select/update only by `workspaceId` + `id`, so without an extra check it will happily move an inbound row into an outbound folder (or vice versa), silently breaking the "never share a folder namespace" invariant. Any resource added to `resolveResourceModel` that shares a table across more than one `FolderType` must add a matching entry to `automatedResponseTypeByFolderType` (or an equivalent map) and thread it into `changeFolder`'s where-clause — see how `packages/database/src/partials/automated-response.ts` does it for Keywords.

18. **Channel-visibility (`Tenant.hiddenChannels`) is a UI gate, not authorization.** The two-tier policy (`tenantService.resolveVisibleChannels`) only decides whether the create UI *renders* a channel — it is never consulted by webhooks, outbound send, or `Inbox`, so a hidden channel that is already connected keeps working. Three consequences that bite silently: (a) the connect **actions** (e.g. `connectTelegramAction`) deliberately do NOT re-check the policy — a hidden channel is still creatable by invoking its action directly; adding true blocking is an authorization change on the action, not a visibility change. (b) Any new enforcement surface must pass the **tenant-aware owner** from `resolvePlatformOwnerId`/`resolveOwnerForWorkspace` (`apps/builder/src/lib/platform-credential-owner.ts`, host wins over `workspaceId`) — pass a bare `userId` and the policy silently falls back to platform-global with no error. (c) The settings surface **grandfathers** already-connected channels (`inboxService.distinctConnectedChannels`); any new gate over `CREATABLE_CHANNELS` must preserve that so hiding never makes an existing connection disappear. The canonical gate is `resolveChannelPolicy`/`requireVisibleChannel` (`apps/builder/src/lib/workspace/`) — the channels layout and every `settings/channels/<channel>/page.tsx` route share its one cached resolution per request, so never hand-roll a separate visibility check that can drift from it. `smtp` (manageable but not creatable) sits outside the policy entirely. See `docs/tenancy.md#channel-visibility-policy`.
<!-- END GENERATED: SHARED-INVARIANTS -->

## Workflow

- After any change: `pnpm lint` + `pnpm --filter <app> check-types`. Use `pnpm fix`, never hand-format.
- Read the matching skill in `.agents/skills/` before new feature/API/table/worker/integration work.
- Git: stage specific files only (never `git add -A`); never commit `.env`/secrets; PR base is `main`.
