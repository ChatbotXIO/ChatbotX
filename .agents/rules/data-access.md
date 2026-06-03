# Data Access Layer Rule

## Principle

All database access **MUST** go through a **service** (`packages/business/`) or **repository** (`packages/database/src/repositories/`). No app-layer code (`apps/builder`, `apps/worker`) may import `db` from `@chatbotx.io/database/client` and execute queries directly.

## Why

- **Centralized logic:** Business rules, cache invalidation, and event emission stay in one place instead of being scattered across actions, queries, and workers.
- **Testability:** Services and repositories can be mocked at a clear boundary.
- **Sharding readiness:** The message table is already sharded; future tables may follow. Services and repositories abstract the routing logic away from callers.
- **Consistency:** Multiple consumers (builder actions, worker handlers, oRPC endpoints) reuse the same data logic instead of duplicating it.

## Allowed layers

| Layer | May import `db` directly? | Role |
|-------|---------------------------|------|
| `packages/database/src/repositories/*` | Yes | Raw query logic, shard routing |
| `packages/business/src/*` | Yes | Business logic, cache, events, orchestrates repositories |
| `apps/builder/src/features/*/actions/` | **No** | Call a service from `@chatbotx.io/business` |
| `apps/builder/src/features/*/queries/` | **No** | Call a service or repository |
| `apps/builder/src/features/*/api/` | **No** | Call a service or repository |
| `apps/worker/src/**` | **No** | Call a service or repository |
| `integrations/**` | **No** | Call a service or repository |

## How to add new data access

1. **Check if a service already exists** in `packages/business/src/<domain>/`. If so, add the method there.
2. **If the domain is new**, create a service file:
   - `packages/business/src/<domain>/service.ts` — class extending `BaseService`
   - `packages/business/src/<domain>/index.ts` — re-export the singleton
   - Add the export to `packages/business/src/index.ts`
3. **For pure query helpers** that don't carry business logic (e.g., shard-routed reads), a repository in `packages/database/src/repositories/<domain>/` is acceptable.
4. **Services accept an optional `tx?: DatabaseClient`** parameter so callers can pass a transaction handle.

## Existing exceptions

Many older features still import `db` directly in actions and queries. These are **legacy exceptions**, not a pattern to follow. New code must not add more.

## Enforcement checklist

Before marking a task done:

- [ ] No new `import { db } from "@chatbotx.io/database/client"` in `apps/` or `integrations/`
- [ ] No new `import ... from "@chatbotx.io/database/schema"` with direct query execution in `apps/` or `integrations/`
- [ ] All DB mutations go through a service method
- [ ] All DB reads go through a service or repository method
