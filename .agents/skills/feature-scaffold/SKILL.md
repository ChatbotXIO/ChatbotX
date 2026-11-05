---
name: feature-scaffold
description: >-
  Scaffold a new builder feature or page under `apps/builder/src/features/<name>/`.
  Use when creating a feature directory, an async server-component page under
  `app/space/[workspaceId]/...`, a client table/form, a next-safe-action server
  action (`workspaceActionClient`), a `queries/` adapter, a TanStack Query hook
  (`orpc.<router>.<proc>.queryOptions()`), or a zustand client-state store.
  Defines the directory layout, build order (public API first, UI last) and the
  new-feature checklist. API mechanics live in `orpc-api`.
---

# Feature Scaffold

## Agent-first build order

The public API is the feature; the UI is a client of it (AGENTS.md invariant 23). Build `api/public.ts` first, then the UI, both calling the same service/`lib/` function. Rules, exemptions, result-returning operations (links, previews, test sends, stats, exports, AI generation), auth stacks, router registration and error handling are owned by the **`orpc-api`** skill (`../orpc-api/SKILL.md`). Service/repository layering and the `.query.ts` contract: **`business-data-access`** skill and `.agents/rules/data-access.md`. Logging: see "Errors and logging" in `orpc-api`.

## Feature Directory Structure

Features live in `apps/builder/src/features/<feature-name>/`:

```
features/<feature-name>/
  actions/              → Server actions (next-safe-action)
    create-item-action.ts
    delete-item-action.ts
  api/                  → oRPC route handlers
    public.ts           → REQUIRED: workspace-token procedures for agents/CLI/MCP
    index.ts            → optional: private (session) router for the UI
    private.ts          → optional: session-based procedures
  queries/              → Request adapters over business services
    index.ts
  schema/               → Zod schemas
    query.ts            → List/filter params
    action.ts           → Mutation inputs
    resource.ts         → Response shapes
  provider/             → TanStack Query hooks for server data
    item-hook.ts         → useItems(), useInvalidateItems()
    item-store.ts        → Zustand store only for client-only state (if needed)
    item-store-context.tsx → Thin provider for route/workspace scoping, if needed
  components/           → UI components (if many)
  hooks/                → Feature-specific non-server-data hooks (if needed)
  item-table.tsx        → Root-level components (if few)
  create-item-dialog.tsx
```

Not every feature needs all directories. A feature folder holds only these; never add a `server/` directory (every prior one became an ad-hoc business layer with `db` access) and never a `*.service.ts` (business logic goes in `packages/business`, see `orpc-api`). Logic only builder can see (e.g. depends on `profileFetcherFactories`) goes in `features/<feature>/lib/*.ts` or `queries/*.ts`, never `"use server"`. A `queries/*.ts` file is a thin request adapter over a service, with no `db` access.

## Core patterns (one-liners; samples in references)

- **Pages** are async server components; `params`/`searchParams` are `Promise<...>`; `getIdFromParams()`; pass `Promise.all([...])` as `promises` to a client component that unwraps with `use(promises)`; URL state via nuqs.
- **Public routes** (short links, webhooks, redirects): Route Handler under `app/<public-prefix>/.../route.ts` plus the prefix in `PUBLIC_ROUTES` (`apps/builder/src/lib/public-routes.ts`); register Tools in `features/tools/tools-list.tsx`.
- **Server actions**: `workspaceActionClient.bindArgsSchemas([z.string()])`; always `.bind(null, workspaceId)` before `useHookFormAction`/`useAction`; `execute()` takes no argument when the action has no input (invariants 4, 6). Default to the most restrictive client; `...AllowExpired` only for delete/disconnect/cancel (invariant 14).
- **Server data** goes through TanStack Query, never a zustand store; every create/update/delete/toggle/move calls the resource invalidator before `router.push` (invariant 21). Zustand is for client-only state.
- **Forms**: React Hook Form + Zod + `useHookFormAction`; nullable text defaults are `""` (never `null`), use `z.preprocess` to map `""` to `null`; read values with `useWatch`, not `form.watch()`. Prefer defined fields from `@chatbotx.io/ui/components/form/*`, `<Card>` and `<Button>`, never raw HTML.
- **i18n is mandatory**: every user-facing string via `useTranslations()`; reuse `fields.*` keys; add keys to all locale files in `apps/builder/messages/` (parity check in `pnpm lint`). See the `builder-ui-i18n` skill.
- **Imports**: never `@chatbotx.io/database/client` or `/schema` from `features/*`; reach data through `@chatbotx.io/business`.

## Tests

- Builder app-level tests for actions, routes, API behavior, cache behavior, or cross-feature behavior go in `apps/builder/__tests__/`.
- Colocated `src/features/**/__tests__` only for narrow component/unit tests clearly owned by that feature.

## Checklist for New Feature

Public API first, UI last:

1. Create feature directory under `src/features/<name>/`
2. Define Zod schemas in `schema/`
3. Add or extend the service method in `packages/business` first (or a `lib/` function for a result-returning operation with no DB access); every caller below only adapts to it
4. **Create the public API in `api/public.ts`**, one procedure per operation, including result-returning ones (`orpc-api`, "Result-returning operations"). Not optional unless the feature is on the invariant 23 exempt list
5. **Register it in `src/routers/public.ts`**, nested under the resource name
6. **Test it**: spec/MCP tests and scope enforcement (`testing-workflow` skill)
7. Create request adapters in `queries/` (only where session context needs adapting)
8. Add server actions in `actions/` (if the UI mutates); they call the same service/`lib/` function as step 4
9. If the UI needs session-authed procedures, add `api/private.ts` + `api/index.ts` and register a `lazy()` branch in `src/routers/index.ts` (`orpc-api`)
10. Create page(s) under `src/app/space/[workspaceId]/...`
11. Build UI components (server page, then client table/form)
12. **Add i18n translations** to every locale file in `apps/builder/messages/`; reuse `fields.*`, add feature text under `<featureName>.*`
13. **Verify no hardcoded strings**: all user-facing text uses `useTranslations()` + `t()`
14. **Parity check**: list every button that creates, changes, or *returns* something. Each must map to a public procedure; any that doesn't is a gap to close or an exemption to justify in the PR
15. Run the **`cli-mcp-docs`** skill so the CLI/MCP docs match the new surface
16. **Templates** — if the feature adds a resource users build, a field on one, or an id that points at another resource, or it writes/deletes/lists a kind templates copy, follow the **`template-integration`** skill (adapter, lock keys, uninstall handler, reference policy, guards, lock badges). A kind or reference the template maps do not know is silently mis-copied or left editable

## References

- `references/page-and-components.md`: read when writing a page, public route, or client component.
- `references/actions-and-queries.md`: read when writing server actions, choosing an action client, or a `queries/` adapter.
- `references/forms.md`: read when building a form (field components, nullable defaults, `useWatch`, `.bind()`).
- `references/server-data-and-state.md`: read for TanStack Query hooks, invalidators, polling/search helpers, zustand stores.
- `references/layout-imports-i18n.md`: read for import paths, route groups/folder bar/accordions, i18n rules.
