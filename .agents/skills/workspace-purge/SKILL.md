---
name: workspace-purge
description: Keep workspace deletion bounded, indexed, resumable, and safe under lock contention.
---

# Workspace Purge Safety

Use this skill for a new table, foreign key, workspace-scoped data, hypertable, or any change to workspace deletion, purge, or runtime freeze.

## Lifecycle

`scheduleDeletion` (reversible grace period) → worker `purgeWorkspaces` →
`workspaceService.teardownDueWorkspace`:

1. acquire the workspace purge lease;
2. freeze runtime work and disconnect integrations/channels only after deletion is due;
3. drain workspace analytics, heavy tables, partitioned rows, and `ContactInboxPost`;
4. delete `Workspace` with bounded timeouts, then release quota;
5. reconcile the owner's correct quota scope.

The scheduled worker may retry this path. Every step must be idempotent and leave incomplete work for the next tick through `WorkspacePurgeIncompleteError`.

## Required rules

1. **Every new foreign-key column needs a leading index.** A parent delete invokes a child RI lookup for every deleted parent row. Nullable `SET NULL` foreign keys use a partial `WHERE column IS NOT NULL` index. Expand `packages/database/__tests__/purge-fk-indexes.test.ts` whenever a high-volume purge path gains an FK.
2. **Drain large workspace tables before the final cascade.** A log, event, stat, per-contact, or per-message table with `workspaceId` belongs in `HEAVY_WORKSPACE_TABLES` in child-before-parent order and needs a leading `workspaceId` index. Partitioned tables delete by their primary-key tuple with a per-table workspace selector; never use `ctid`. Hypertables drain one workspace-bearing chunk at a time with `liftDecompressionLimit`.
3. **Delete workspace-scoped tables without a foreign key explicitly.** A missing FK does not make data disappear at workspace deletion. Add a bounded purge stage.
4. **Keep every purge/freeze statement bounded.** Use a `LIMIT` plus keyset or `FOR UPDATE SKIP LOCKED`, one short transaction per batch, and no `IN` built from every matching id. Never call HTTP while holding a database transaction. Use `withPurgeTimeouts`; stop before the cron deadline so its run stays below the distributed-lock TTL.
5. **Make teardown idempotent.** It runs again on each tick. Convert temporary lock/timeout failures into `WorkspacePurgeIncompleteError` so the next tick resumes safely.
6. **Reconcile the correct quota scope.** Call `userQuotaService.reconcileOwnerAfterTeardown(ownerId)`; never count all root-tenant resources as a reseller pool.

## Before merge
- Run `pnpm --filter @chatbotx.io/database test` and inspect the purge FK index tests.
- Inspect generated migration SQL. Partitioned indexes must use per-partition `CREATE INDEX CONCURRENTLY`, `ON ONLY` parent indexes, `ATTACH PARTITION`, and validity checks.
- Run `EXPLAIN (ANALYZE, BUFFERS)` in `BEGIN … ROLLBACK` for representative purge batches. RI triggers must use index scans.
- Verify a purge alongside activity in another workspace: no long-lived lock waits and no purge transaction longer than a batch.
