# Broadcast status actions — production deploy runbook (2026-09)

This runbook consolidates the two final production reviews for the
`feat/whatsapp-calling`-adjacent broadcast status-actions work (stop /
resume / move-to-draft / soft-delete). It covers migration order, the
worker/builder deploy sequence, and post-deploy monitoring.

Related migrations:

- `packages/database/drizzle/20260831040225_add_broadcast_draft_failed_status`
- `packages/database/drizzle/20260902054310_add_broadcast_soft_delete_and_resume`

Neither migration has been applied yet. Apply them by hand (`db:migrate`
after review) — do not script this as part of a broader deploy job without
the ordering below.

## 1. Apply migration `20260831040225` (enum `draft`/`failed` + `handoffCompletedAt`)

```sql
ALTER TYPE "broadcastStatus" ADD VALUE 'draft';
ALTER TYPE "broadcastStatus" ADD VALUE 'failed';
ALTER TABLE "Broadcast" ADD COLUMN "handoffCompletedAt" timestamp(6) with time zone;
```

- This commit **must complete before any new binary (worker or builder)
  starts**. Both new code paths reference the `draft` and `failed` enum
  values and the `handoffCompletedAt` column; starting a new process against
  the old schema will error on first write.
- **Older PostgreSQL caveat**: on PostgreSQL versions **before 12**,
  `ALTER TYPE ... ADD VALUE` cannot run inside a multi-statement transaction
  block at all — Postgres errors immediately on the `ALTER TYPE` statement
  itself, regardless of whether anything later uses the new value. This
  migration bundles two `ADD VALUE` calls with an `ALTER TABLE` in one
  transaction, so **as written it fails outright on PG < 12**; there, each
  `ADD VALUE` must be split into its own separately-committed step.
  PostgreSQL **12+** relaxed this: `ADD VALUE` may run inside a transaction
  block, but the new value still cannot be **used** by any statement until
  that transaction commits (this migration never uses the new values, so it
  is safe as written on PG 12+ — and the repo's `run-migrations.mjs` applies
  migrations sequentially for exactly this reason). The "commit before any
  new binary starts" rule still applies because the *old* binaries are still
  running against this schema during rollout.

## 2. Apply migration `20260902054310` (deletedAt, resumeCount, indexes)

```sql
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(6) with time zone;
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "resumeCount" integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Broadcast_deletedAt_idx" ON "Broadcast" ("deletedAt") WHERE "deletedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_unsent_idx" ON "ContactOnBroadcast" ("broadcastId") WHERE "sent" = false AND "failedAt" IS NULL;
```

Every statement is deliberately **idempotent** (`IF NOT EXISTS`) so the
migration is retry-safe end to end — required for the large-table
`CONCURRENTLY` path below, where the migration runs unwrapped and a failed
index build must be safely re-runnable without tripping over the
already-added columns.

- The two `Broadcast`-table changes (new columns + `Broadcast_deletedAt_idx`)
  are small and effectively instant — `Broadcast` is a low-row-count table.
  Safe to run inside the normal migration transaction.
- **`ContactOnBroadcast_unsent_idx` is the risk on production.** On a large
  `ContactOnBroadcast` table, a plain `CREATE INDEX` takes a table-level
  lock that blocks concurrent writes (including in-flight broadcast sends)
  for the duration of the build.
  - **If `ContactOnBroadcast` is large in production**: BEFORE applying the
    migration, insert the single word `CONCURRENTLY` into the LAST statement
    (in the committed migration file, as a committed change applied BEFORE
    the migration runs anywhere that matters):

    ```sql
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_unsent_idx"
      ON "ContactOnBroadcast" ("broadcastId")
      WHERE "sent" = false AND "failedAt" IS NULL;
    ```

    then run `db:migrate` normally — the repo's migrator
    (`packages/database/scripts/run-migrations.mjs`) natively detects
    `CONCURRENTLY` and executes such a migration **unwrapped** (outside a
    transaction), which is exactly what `CREATE INDEX CONCURRENTLY`
    requires. Because every statement is idempotent, a failed concurrent
    build (which leaves the migration unrecorded) is safe to simply re-run.
    Why the edit must land BEFORE apply and be committed: the migrator's
    pending-migration detection compares **names only** (the stored content
    hash is informational — see `drizzle-orm`'s migrator), so a file edited
    AFTER apply is silently ignored on that database, and a divergent
    committed copy means other environments run different SQL than
    production did. Confirm success and check for `INVALID` indexes
    afterward:

    ```sql
    SELECT indexrelid::regclass, indisvalid
    FROM pg_index
    WHERE indexrelid = '"ContactOnBroadcast_unsent_idx"'::regclass;
    ```

    If `indisvalid` is `false` (a concurrent build failed, e.g. due to a
    conflicting lock), `DROP INDEX` and retry `CREATE INDEX CONCURRENTLY`
    — do not leave an invalid index in place.
  - **If `ContactOnBroadcast` is still small** (e.g. staging, a fresh
    workspace-heavy deploy target), the plain `CREATE INDEX` in the
    migration file is fine as-is.

## 3. Deploy the worker before (or atomically with) the builder

- **Deploy WORKER first**, or simultaneously with the builder — never the
  builder first with an old worker still running.
- **Drain or pause the `sendBroadcast` drivers for the deploy window**
  (finish active jobs, hold queued ones) before swapping worker binaries.
  This closes the one-time jobId-format dedup residual described at the end
  of this runbook: an old worker crashing mid-batch between `queue.add` and
  its recipient mark could otherwise yield ~1 duplicate send when the new
  producer re-enqueues under the new `-rN` id format.
- **Why**: the new builder exposes stop/resume actions that rely on the new
  worker's handling of `handoffCompletedAt` and the pinned
  `resumeSending` transition. An **old worker + new builder** combination
  lets a user-initiated stop get raced by the old worker, which does not
  know about the new `cancelled` semantics — it can flip a user-stopped
  broadcast back to `sending`/`sent` and continue delivering into a run the
  user believed was stopped (tracked as finding I-2 in the review).
- An **new worker + old builder** combination is safe: the new worker
  correctly respects the pinned transition scope even if the builder UI
  hasn't yet exposed the new actions.

## 4. Deploy the builder last

- Deploy the builder once the worker (with the new migrations already
  applied) is live.
- **No backfill needed**:
  - `resumeCount` defaults to `0` — existing rows are correct as-is.
  - `deletedAt` and `handoffCompletedAt` are nullable; `NULL` on every
    pre-existing row is the correct legacy semantic (nothing was
    soft-deleted or mid-handoff before this feature existed).
  - `purgeBroadcasts` self-registers its own cron/schedule entry on worker
    startup — no manual registration step.

## 5. Post-deploy monitoring

Watch the following for the first deploy window (recommend at least the
first hour, with a longer tail check at 24h for the soft-delete purge job):

- **Queue depth** for broadcast-sending queues — a sustained climb suggests
  the new `ContactOnBroadcast_unsent_idx` build (if run `CONCURRENTLY`
  post-migration) hasn't landed yet and per-batch scans are still walking
  the full sent prefix on large broadcasts.
- **Stale `sending` rows** — broadcasts stuck in `sending` with no recent
  `ContactOnBroadcast` activity. Cross-check against `handoffCompletedAt`
  to catch any finalize-race regressions.
- **Stop / resume audit log entries** — confirm `broadcast_stopped`,
  `broadcast_resumed`, and `broadcast_moved_to_draft` entries are being
  recorded as expected (the last one is a renamed audit action — see
  finding #4 in the review; anything still logging as generic `update` for
  a move-to-draft indicates a stale builder deploy).
- **Purge summary logs** — the `purgeBroadcasts` job's per-run summary
  (soft-deleted count, hard-deleted count, skipped-due-to-sending count)
  should show a low steady-state rate. A spike after deploy is expected
  once historical soft-deletes flow through; a sustained elevated rate is
  not.
- **`EXPLAIN` on `listBroadcasts`** if the broadcasts table page feels slow
  post-deploy — confirm the planner is using `Broadcast_deletedAt_idx`
  rather than falling back to a sequential scan, especially on workspaces
  with a large broadcast history.

## Rollout-window residuals & intentional semantic deltas (final regression review)

**Two one-time, rollout-window-only residuals (both under-delivery-or-single-dup, never systemic):**
1. *Dedup format change*: if an OLD worker crashes exactly between `queue.add` and `markContactSent`, the NEW producer re-enqueues that contact under the new `-r0` jobId which does not dedup against the retained old-format id → worst case ~1 duplicate send per crashed driver run, only during the rollout hour. Mitigation: drain/pause `sendBroadcast` drivers for the deploy window (see the drain instruction in step 3); steady-state dedup is fully restored post-deploy.
2. *Stop→Resume on a broadcast that was mid-send across the rollout*: root flow jobs enqueued by the OLD worker carry no `initialBroadcastDispatch` marker; if such a broadcast is STOPPED while those jobs execute under the new worker, they skip WITHOUT resetting → Resume will not re-target those recipients (permanent under-delivery for them). Deliberately NOT "fixed" — the only fallback (field-absence inference) reintroduces a duplicate-delivery path, and the accepted fail direction is under-delivery. Operator guidance: during the rollout hour avoid Stop on broadcasts started before the deploy; if one was stopped, verify recipient counts after resume.

**Five intentional semantic deltas vs main (documented product decisions, list them in the PR body):**
1. An ALL-failed broadcast now finalizes as `failed` (main reported `sent`); fires only at exactly 100% failure.
2. `broadcast_sent` audit is now emitted by finalize (`source: "schedule:finalizeBroadcasts"`, up to 10 min after hand-off) — anything filtering on the old `schedule:processBroadcastContacts` source stops matching new rows.
3. `sending` persists in the UI until finalize resolves (main flipped to `sent` at hand-off); resend availability is delayed by the same amount.
4. `schedulesAt` validation is minute-truncated — a "future" time within the current minute is now rejected instead of accepted-and-immediately-eligible.
5. `splitTraffic` now forwards `metadata`: broadcast/sequence sends past a split are suppressed from per-message provider error logs via BULK_SEND_ORIGINS (previously logged individually); webview/appointment payloads crossing a split remain safe (stepId-gated readers).
