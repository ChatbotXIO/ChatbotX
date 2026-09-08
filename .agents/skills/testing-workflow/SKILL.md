---
name: testing-workflow
description: Use when adding or changing tests, or before considering a change done, in ChatbotX. Documents the real verification gate sequence (lint → types → test → coverage), where tests live, the Vitest setup, and the coverage threshold that must not be silently bypassed. Read before writing tests or claiming a task is verified.
---

# Testing Workflow (ChatbotX)

The verification gate every change passes before it is "done". CI runs Types, Lint, and Tests on every PR and on push to `main` (`.github/workflows/ci.yml`), so a failure here blocks the merge — run the gate locally first rather than discovering it in CI.

## The gate sequence (run in order, fix before advancing)

1. **Lint** — `pnpm lint` (Ultracite/Biome). Use `pnpm fix` to auto-fix, never hand-format.
2. **Types** — `pnpm --filter <app|package> check-types` for every workspace you touched.
3. **Test** — run the affected package's Vitest suite.
4. **Coverage** — keep the 80% threshold (`packages/vitest-config/src/node.ts`). Do **not** set `VITEST_SKIP_COVERAGE_THRESHOLDS` to dodge it — that silently nulls all thresholds and hides under-coverage.

## Where tests live

- App/package/integration-level tests (actions, routes, API behavior, cache, worker behavior, cross-boundary): `<workspace>/__tests__/` — e.g. `apps/builder/__tests__`, `apps/worker/__tests__`, `packages/sdk/__tests__`, `integrations/messenger/__tests__`.
- Narrow unit/component tests owned by one module: colocated `src/**/__tests__`.

## Test design (AAA + behavior names)

- Arrange–Act–Assert structure.
- Name by behavior: `test('throws ChannelError when sourceConversationId is missing')`, not `test('works')`.
- Test the boundary that matters: actions, routes, repositories, worker handlers, channel send/receive.
- Mock the database client for unit tests; use the repository/service layer, never `db` directly.

## Testing TanStack Query hooks

Mock `@/lib/orpc/orpc` (`vi.hoisted` + `vi.mock`, same pattern as
`chat-store.test.ts`) so the hook's underlying `client.*` call is a spy, then
wrap the component under test in a fresh `QueryClientProvider` per test
(`new QueryClient({ defaultOptions: { queries: { retry: false } } })`) so
query state doesn't leak between tests. See `__tests__/use-ai-agents.test.tsx`
for the reference: dedup across two readers, `enabled` guard on missing input,
error surfacing without throwing, and invalidation triggering a refetch.

## What to test first (highest signal in this repo)

- New oRPC route / server action → its happy path + auth-scoping + one failure path.
- New service method → unit test in `packages/business/__tests__`, mocking the repositories/services it calls — this is the layer that carries validation, cache invalidation, and events, so it's the highest-signal place to test new business logic (see `.agents/rules/data-access.md`).
- New repository method → query correctness incl. `workspaceId` scoping.
- New worker consumer → success / error / retry / idempotency on re-run.
- New channel integration → webhook receive parse + outgoing send mapping.
- Public handler and private action converge on one service method → assert both call sites resolve to the same method call, with only the caller's scope differing. See `apps/builder/__tests__/contacts-crud-public-api.test.ts` (public, unscoped) alongside `apps/builder/__tests__/contacts-permissions.test.ts` (private, scoped) — both exercise `contactService.list`/`count`, never a parallel implementation.

## Stop condition

A change is verified only when lint + the touched packages' `check-types` + the affected tests all pass, with coverage at/above threshold (not skipped). If you cannot run a gate, say which and why — do not report "verified" on an unrun gate.
