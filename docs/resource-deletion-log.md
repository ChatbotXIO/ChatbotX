# Resource deletion log

This document is for developers touching workspace deletion, channel
disconnects, account deletion, or anything that should leave a durable "who
deleted this, from where, and when" trail. `ResourceDeletionLog`
(`packages/database/src/schema/resource-deletion-log.ts`) records that trail
for workspaces, channels, and users today, and is shaped so another resource
type is one more enum value, not a new table.

It exists because nothing else survives a workspace purge: `AuditLog` has a
cascading `workspaceId` FK and is drained as a heavy table before the final
`Workspace` delete, it is skipped on the community edition, and it is written
through a queue. `WorkspaceDeletionRecord` is retained, but it covers
workspaces only, is written at purge time, and has no IP, user agent or status.

## Model

One row per deletion **request**. The table has only a primary key — no
foreign keys and no secondary indexes — so every column is a historical value
that outlives the workspace, the user and the resource it describes.

| Column | Meaning |
| --- | --- |
| `workspaceId` | Owning workspace. For a workspace row it equals `resourceId`; null for an account deletion. |
| `resourceType` | `workspace`, `channel`, or `user` (`resourceDeletionResourceTypes`). |
| `resourceId` | Text, so a resource whose key is not a bigint still fits. |
| `resourceSubtype` | Resource-defined kind. For a channel, its `ChannelType`. Text, so shared code never lists channels. |
| `resourceName` | Snapshot of the name — the row it came from is gone later. |
| `status` | `pending`, `completed` or `canceled` (`resourceDeletionStatuses`). |
| `requestedByUserId` | The requester. Null for a system actor or an unknown one. |
| `requestSource` | `AuditActor.source` as is: `api-token:<id>`, `mcp-oauth:<client>`, `mobile:<device>`, `template:uninstallTemplate`… Null means a session request or no source. |
| `ipAddress`, `userAgent` | From the request's audit context. They come from request headers, so they are capped at 64 and 1024 characters before they are stored. |
| `requestedAt`, `completedAt`, `canceledAt` | Written explicitly, never defaulted. |

A workspace-token request is attributed to the **workspace owner**
(`workspace-token-auth.ts`), because an opaque token has no individual user.
`requestSource` (`api-token:<id>`) is what tells it apart from the owner acting
in the UI.

## Lifecycle

**Workspace.** A deletion is asynchronous, so its row has a lifecycle.

1. `workspaceService.scheduleDeletion` writes a `pending` row, attributed to the
   `actorId` it was given, in the same transaction as the `Workspace` update. A
   repeat submit (which moves the deadline) closes the earlier request as
   `canceled` and writes a new `pending` one, so each accepted submit keeps its
   own requester.
2. `workspaceService.cancelDeletion` closes the pending request as `canceled`.
3. The purge job completes it inside the transaction that deletes the
   `Workspace` row, so the row reads `completed` if and only if the workspace is
   gone. A failed or retried purge leaves it `pending`.

`scheduleDeletion` and `cancelDeletion` lock the `Workspace` row
(`workspaceRepository.findByIdForUpdate`, `FOR NO KEY UPDATE`) so concurrent
calls serialize with each other and with the purge fence. It is deliberately
not `FOR UPDATE`: that is the only row lock that conflicts with the
`FOR KEY SHARE` every insert into a table with an FK to `Workspace` takes, and
would stall all of that workspace's writes until commit. Because
`workspaceService.update` invalidates caches before the transaction commits,
the caches are invalidated again after a commit this call opened.

A workspace scheduled **before this log existed** has no pending row. Cancel,
resubmit and purge recover the earlier request from what the `Workspace` row
stored (`deletionRequestedById`, `deletionRequestedAt`) and write it with an
unknown origin: the actor running now did not make that request, so its IP,
user agent and source are never copied onto it
(`resourceDeletionLogService.recordHistoricalRequest`).

**User.** Account deletion is asynchronous. The request records one `user`
row with a null `workspaceId`, then schedules each owned workspace. The user
purge only completes the row after no owned workspace remains and the `User`
row is deleted.

**Channel.** A disconnect is synchronous, so its row is written already
`completed`.

- `connectionStateService.transition` records it for a non-noop
  `user.disconnect` of a `channel` connection, inside the transition's own
  transaction. Every user-initiated channel removal converges there: the
  per-channel disconnect actions, the existing public `DELETE` endpoints,
  `connectionService.disconnect`, and the template-uninstall worker (logged as a
  system actor, `requestSource = "template:uninstallTemplate"`).
- A repeat disconnect is a noop transition, so it writes nothing.
- The system tearing a channel down (`teardown.pause` / `teardown.disconnect`:
  trial expiry, tenant suspension, workspace purge) is not logged.
- A connection with no `Connection` row yet (not backfilled) takes the legacy
  inbox-only path, `connectionStateService.disconnectLegacyInbox`. With a caller
  `tx` it locks the inbox row (`inboxRepository.findByIdForUpdate`), logs only
  if the inbox was not already disconnected, and commits with the caller. Without
  one it logs after the disconnect, best effort: a failed write is logged and
  never fails a disconnect that already took effect. It does not open a new
  transaction around `inboxService.disconnect`, which releases quota before any
  surrounding transaction commits.

`connectionService.disconnect` tears the provider side down before its local
transaction. If the process dies in between, no local state changed and no row
was written; the retry does both. The log reflects **committed local
deletions**.

## Who writes it

`resourceDeletionLogService` (`packages/business/src/resource-deletion-log/`) is
the only writer.

- `recordRequest` reads the user, IP, user agent and source from the audit
  context through `readAuditActor` (`packages/business/src/audit/actor.ts`).
  That is the Edge-safe counterpart of `getAuditActor`: `audit/context.ts`
  imports `node:async_hooks`, which the business barrel must not reach
  (`__tests__/edge-safe-import-graph.test.ts`). An explicit `requestedByUserId`
  overrides the user.
- `recordHistoricalRequest` records an earlier request with an unknown origin.
- `findPendingId` finds a resource's newest `pending` row (a read).
  `completePending` and `cancelPending` move a request
  `pending → completed | canceled`; they match only `pending` rows, so a repeat
  or concurrent call updates nothing.

Every write takes the caller's `tx`, so the row commits with the deletion it
describes.

## No index

The table has only its primary key by decision. A lookup by resource scans the
table. It is cheap because rows come from rare, user-initiated deletions, and
the scans are kept out of hot paths and out of long transactions: the purge
resolves the pending row **before** its final transaction, under the purge
timeouts (a slow or blocked scan defers the purge to the next run) and before
the last deadline check, then completes it by primary key inside that
transaction.

`resourceDeletionLogService` logs `resource-deletion-log: slow unindexed scan`
when a resource-form lookup takes 500 ms or more. If that appears, add one
`(resourceType, resourceId)` index in a migration.

The table is registered in `NO_FK_WORKSPACE_TABLES` as `retainedBilling`
(`packages/database/src/repositories/workspace-purge/tables.ts`). The stage name
is about billing, but what it does is the point: the purge never drains it, so
the log outlives the workspace.

## What it is not

- It is not exposed through the public API, the CLI, MCP or the UI yet.
- It is not an `AuditLog` replacement: `AuditLog` still records what a user did
  inside a workspace.
- It is an ordinary mutable table, not a tamper-evident ledger.

## Adding a resource type

1. Add the value to `resourceDeletionResourceTypes`
   (`packages/database/src/partials/resource-deletion-log.ts`) and generate the
   migration (a Postgres enum value).
2. At the one place the deletion becomes real, call
   `resourceDeletionLogService.recordRequest` with a `ResourceDeletionTarget`
   (`type`, `id`, `workspaceId`, optional `subtype` and `name`) on the
   deletion's transaction. For an asynchronous deletion, record `pending` at
   submit and `completePending` / `cancelPending` later.
3. Do not make shared code branch on the resource: put anything resource
   specific in `resourceSubtype`.
