---
name: business-data-access
description: >-
  Implement or modify ChatbotX business services, repositories, cache
  invalidation, event emission, and data-access boundaries. Use when app,
  worker, or integration code needs database-backed reads or mutations without
  importing db directly.
---

# Business Data Access

Use this skill whenever code outside `packages/business` or
`packages/database/src/repositories` needs database-backed behavior.

## The chain

`action | API handler → service (packages/business) → repository
(packages/database/src/repositories) → DB`. This is the wording to use —
never "service **or** repository" as if they were interchangeable
alternatives for the app layer. The app layer calls a service; the service
may call a repository. See `.agents/rules/data-access.md` for the full rule
and the per-layer responsibility table.

## Boundary Rule

Do not add direct database imports in:

- `apps/builder`
- `apps/worker`
- `integrations`

These layers call services from `@chatbotx.io/business`. Legacy direct `db`
imports are exceptions, not examples to copy. The one narrow exception is a
**pure read with zero business logic** — no cache, no validation, no
cross-table composition — which may call a repository from
`@chatbotx.io/database/repositories` directly; this is the exception, not
the default, so reach for a service first.

Allowed direct `db` usage:

- `packages/business/src/**`
- `packages/database/src/repositories/**`

## Service responsibilities

A service owns:

- Input validation and authorization-adjacent checks (e.g. quota, ownership).
- Orchestration across one or more repositories.
- Cache invalidation (`this.invalidateCacheTags(...)`).
- Event emission (`emit*` from `@chatbotx.io/events`, `@chatbotx.io/event-bus`).
- Audit records (`this.audit(...)`).
- An optional `tx?: DatabaseClient` passthrough so callers can compose it into
  their own transaction.
- **Never** imports from `apps/` or `integrations/` — a service has no idea
  who is calling it (a builder action, a worker job, a public API handler).

## Choosing Service vs Repository

Use a business service when the method has business semantics, authorization
adjacent constraints, cache invalidation, event emission, composition across
tables, or is reused by app and worker code.

Use a repository when the method is a low-level persistence concern such as
shard routing, specialized pagination, a where-builder shared across callers,
or reusable raw query mechanics. **Repositories are raw only** — no cache
invalidation, no event emission, no validation. If a query needs any of
those, it belongs behind a service method that calls the repository, not in
the repository itself.

## Service Pattern

Services live in `packages/business/src/<domain>/`.

```
<domain>/
  service.ts
  index.ts
```

Typical shape:

```typescript
import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { BaseService } from "../base.service"

class ExampleService extends BaseService {
  async doThing(props: {
    workspaceId: string
    tx?: DatabaseClient
  }) {
    const { workspaceId, tx = db } = props
    // query/mutate with tx
    await this.invalidateCacheTags([`examples:${workspaceId}`])
  }
}

export const exampleService = new ExampleService()
```

Also export from:

- `packages/business/src/<domain>/index.ts`
- `packages/business/src/index.ts`

## Transaction Pattern

- Accept `tx?: DatabaseClient` in service methods that may compose with other operations.
- Default to `db` inside the service: `const { tx = db } = props`.
- Pass `tx` through nested service/repository calls.

## Cache and Events

- Extend `BaseService` to use `invalidateCacheTags()`.
- Use `withCache` from `@chatbotx.io/redis` only around stable reads with clear keys.
- Emit domain events from services when mutations affect downstream workflows.
- Fire-and-forget events should handle `.catch(() => {})` if the local pattern does.

## Repository Pattern

Repositories live in `packages/database/src/repositories/<domain>/`.

```
repositories/<domain>/
  repository.ts
  index.ts
```

Export new repositories from `packages/database/src/repositories/index.ts`.
Use the `drizzle-database` skill for schema, relation, and migration work.

## App Layer Usage

### Session-free read: no query file needed

`tagService.list` needs nothing from the request session — the builder calls
it directly from wherever it's needed (a page, another query), with no
`.query.ts` adapter in between:

```typescript
import { tagService } from "@chatbotx.io/business"

const { data } = await tagService.list({ workspaceId })
```

If you find yourself writing a one-line pass-through query file that only
forwards its arguments to a service, delete the file and call the service
directly instead.

### Session-context read: a thin `.query.ts` adapter

`get-contact.query.ts` needs the current member's permission scope before it
can call the service — that's the shape a query file exists for:

```typescript
// apps/builder/src/features/contacts/queries/get-contact.query.ts
import { contactService } from "@chatbotx.io/business"
import { requireContactPermissionScope } from "../permissions"

export async function getContact(input: { workspaceId: string; id: string }) {
  const accessScope = await requireContactPermissionScope(input.workspaceId)
  const contact = await contactService.findDetailOrFail({
    workspaceId: input.workspaceId,
    id: input.id,
    accessScope,
  })
  return maskIfNeeded(contact, accessScope)
}
```

The query file's only job is: resolve session context → plain params → call
the service → shape the response. It holds no where-builders, no pagination,
no count strategy — see `.agents/rules/data-access.md` for the full
`.query.ts` contract.

### Public API and private paths share one service method

An unscoped workspace-token caller and a signed-in member both resolve to
`contactService.list({ ...input, scope })` — the only difference is what
`scope` the app layer resolved (`undefined` for the token, a permission
scope for the member):

```typescript
// Public API handler (workspace token — unscoped)
.handler(async ({ context, input }) =>
  await contactService.list({ ...input, workspaceId: context.workspace.id }),
)

// Private query adapter (signed-in member — scoped)
export async function listContacts(input: ListContactsRequest) {
  const scope = await requireContactPermissionScope(input.workspaceId)
  return await contactService.list({ ...input, scope })
}
```

Never write a second implementation of the list/count/filter logic for the
public path — both callers must converge on the same service method so a bug
fix or a new filter only has to happen once.

Workers and integrations follow the same boundary.

## Verification

Before finishing:

- Search changed app/worker/integration files for new direct `db` imports.
- Add or update focused service/repository tests when behavior is non-trivial.
- Run the smallest relevant test/typecheck script from the touched workspace.
