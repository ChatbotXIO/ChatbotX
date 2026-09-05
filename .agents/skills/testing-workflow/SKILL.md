---
name: testing-workflow
description: Use when adding or changing tests, or before considering a change done, in ChatbotX. Documents the real verification gate sequence (lint → types → test → coverage), where tests live, the Vitest setup, and the coverage threshold that must not be silently bypassed. Read before writing tests or claiming a task is verified.
---

# Testing Workflow (ChatbotX)

The verification gate every change passes before it is "done". CI currently does **not** run these (it builds Docker images only), so they are enforced locally — run them yourself, do not assume CI catches regressions.

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
- New repository method → query correctness incl. `workspaceId` scoping.
- New worker consumer → success / error / retry / idempotency on re-run.
- New channel integration → webhook receive parse + outgoing send mapping.

## Stop condition

A change is verified only when lint + the touched packages' `check-types` + the affected tests all pass, with coverage at/above threshold (not skipped). If you cannot run a gate, say which and why — do not report "verified" on an unrun gate.
