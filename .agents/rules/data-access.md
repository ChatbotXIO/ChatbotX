---
name: data-access
description: >-
  Enforces the action/API handler → service → repository → DB chain in
  ChatbotX. Read before adding or reviewing code in apps/builder,
  apps/worker, integrations/*, packages/business, or packages/database that
  reads or writes data.
globs:
  - apps/builder/**
  - apps/worker/**
  - apps/mcp-server/**
  - integrations/**
  - packages/business/**
  - packages/database/**
---

# Data Access Layer Rule

## Principle

The chain is: **action / API handler → service (`packages/business/`) → repository (`packages/database/src/repositories/`) → DB**. No app-layer code (`apps/builder`, `apps/worker`, `integrations/`) may import `db` from `@chatbotx.io/database/client` and execute queries directly. The one exception is a **pure read with zero business logic** — see the carve-out below.

## Why

- **Centralized logic:** Business rules, cache invalidation, and event emission stay in one place instead of being scattered across actions, queries, and workers.
- **Testability:** Services and repositories can be mocked at a clear boundary.
- **Sharding readiness:** The message table is already sharded; future tables may follow. Services and repositories abstract the routing logic away from callers.
- **Consistency:** Multiple consumers (builder actions, worker handlers, oRPC endpoints, public API tokens) reuse the same data logic instead of duplicating it.
- **Public API / MCP surfaces need the same guarantees as the UI.** A workspace-token caller and a signed-in member hitting the same resource must run the same validation, cache invalidation, and event emission — which only happens if both call the same service method.

## Per-layer responsibilities

| Layer | May import `db`? | Owns |
|-------|---|------|
| `packages/database/src/repositories/*` | Yes | Raw where-builders, joins, pagination, shard routing. **Never** cache invalidation, event emission, or validation. |
| `packages/business/src/*` | Yes | Validation, orchestration across repositories, cache invalidation, events, audit, quota checks, optional `tx?: DatabaseClient` passthrough. **Never** imports from `apps/` or `integrations/`. |
| `apps/builder/src/features/*/actions/` | **No** | Parse input → call a service method → map the result/error for the client. |
| `apps/builder/src/features/*/queries/` | **No** | See the `.query.ts` contract below. |
| `apps/builder/src/features/*/api/` | **No** | Resolve session context into plain params, call the same service method the private path uses. |
| `apps/worker/src/**` | **No** | Call a service or repository. |
| `integrations/**` | **No** | Call a service or repository. |

**Repository-from-app-layer exception:** a pure read with zero business logic (no cache, no validation, no shape mapping beyond selecting columns) may call a repository directly from the app layer. This is the exception, not the default — reach for a service first, and only fall back to a bare repository call when there's genuinely nothing for a service to add.

## The `.query.ts` file contract

A file under `apps/builder/src/features/*/queries/` (`get-x.query.ts`, `list-x.queries.ts`) is a thin request adapter over one or more services. It:

- **MAY** read session context (current user, member permissions) and turn it into plain params (`accessScope`, `canViewEmailAndPhone`, `restrictToAssignedUserId`, …) passed into a service call.
- **MAY** map a service result onto the builder's response/UI shape.
- **MAY** compose several services for one screen.
- **MUST NOT** hold where-builders, joins, pagination logic, count/caching strategy, or anything a worker or the public API would also need — that belongs in the service (orchestration) or repository (raw query), not duplicated per caller.
- **MUST NOT** import `db` — call a service (or, for the pure-read exception above, a repository).

**A session-free read is called straight from the handler; it needs no query file at all.** Only add a `.query.ts` file when there is real builder-side session-context work (permission scope resolution, response shaping) to adapt.

## Public API and private paths share one service method

The public API (workspace-token) handler and the private action/query adapter for the same operation **must call the same service method**. Only the app layer resolves the caller's permission scope (member permissions vs. an unscoped token) and passes it into the service as plain data (`scope`/`accessScope`) — the service itself never knows whether the caller was a signed-in member or a token. Do not write a second, parallel implementation of the same logic for the public path "because it's simpler" — that is exactly the duplication this layering exists to prevent.

## How to add new data access

1. **Check if a service already exists** in `packages/business/src/<domain>/`. If so, add the method there.
2. **If the domain is new**, create a service file:
   - `packages/business/src/<domain>/service.ts` — class extending `BaseService`
   - `packages/business/src/<domain>/index.ts` — re-export the singleton
   - Add the export to `packages/business/src/index.ts`
3. **For pure query helpers** that don't carry business logic (e.g., shard-routed reads, a where-builder shared across callers), a repository in `packages/database/src/repositories/<domain>/` is acceptable — but the service is still the thing the app layer calls; the app layer reaches the repository directly only under the pure-read exception above.
4. **Services accept an optional `tx?: DatabaseClient`** parameter so callers can pass a transaction handle.

## Existing exceptions

Many older features still import `db` directly in actions and queries. These are **legacy exceptions**, not a pattern to follow. New code must not add more.

## Enforcement checklist

Before marking a task done:

- [ ] No new `import { db } from "@chatbotx.io/database/client"` in `apps/` or `integrations/` (outside the pure-read repository exception)
- [ ] No new `import ... from "@chatbotx.io/database/schema"` with direct query execution in `apps/` or `integrations/`
- [ ] All DB mutations go through a service method
- [ ] All DB reads go through a service (or, for a pure read with zero business logic, a repository)
- [ ] A public API handler and its private-path equivalent call the same service method, with only the caller's scope differing
- [ ] `.query.ts` files hold no where-builders, pagination, or count logic — that lives in the service/repository
