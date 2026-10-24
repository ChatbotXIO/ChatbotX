---
name: reliability-concurrency
description: Use when writing code that runs concurrently in ChatbotX — BullMQ worker consumers, sharded DB migrations, embedding replace-writes, or any multi-step operation that could be retried or run by two workers at once. Covers advisory locks, idempotency, transactions, and safe-retry patterns. Read before adding a worker job, migration runner, or replace-style write.
---

# Reliability & Concurrency (ChatbotX)

Production runs multiple worker instances and re-tries failed jobs. Code that is correct single-threaded can corrupt data when two workers race or a job re-runs. Apply these patterns.

## 1. Guard schema/DDL changes with an advisory lock

Migration runners (e.g. `packages/database/src/sharding/message/shard-migration-runner.ts`) must not let two workers apply the same DDL concurrently. Wrap the apply loop:

- Take a `pg_advisory_lock` (or `pg_try_advisory_lock`) keyed on the shard before reading the current version.
- Do the version check and each migration apply inside a transaction so a crash mid-step rolls back.
- Make "read version → apply → write version" atomic; never read-then-write across two unguarded statements.

## 2. Make replace-writes atomic AND race-safe

Delete-then-insert (e.g. embedding `replaceForSource`) must be:

- **Atomic** — inside a single `transaction()` so there is no zero-row window within one worker (this is already done in the embedding repo).
- **Race-safe** — add an advisory lock or optimistic-concurrency guard keyed on the `sourceId`, so two workers processing the same source don't delete each other's fresh rows. A transaction alone does not prevent the cross-worker race.

## 3. Idempotent job consumers

- A BullMQ job can run more than once (retry, redelivery). Design the handler so re-running produces the same end state.
- Guard the status transition: `UPDATE … SET status='processing' WHERE id=? AND status='pending'` and check the affected-row count, instead of read-`pending`-then-write-`processing` (two workers both pass the read).
- Use a natural idempotency key (source id + content hash) before re-inserting derived data.

## 4. Fail loudly, degrade safely

- If a dependency (RAG store, Redis, downstream channel) is down, surface the error and let BullMQ retry — do not write partial/corrupt state and return success.
- Never swallow errors in a worker handler; an unlogged failure in a background job is invisible until data is wrong.

## 5. Parallel agents / git

- Multiple agents editing the same working tree corrupt each other's git index. For parallel work use separate git worktrees.
- Stage specific files only — never `git add -A`/`.` (`.agents/rules/git.md`).
## 6. Bulk deletes and updates

- Bound every statement with a `LIMIT` and keyset or `FOR UPDATE SKIP LOCKED`.
- Commit each batch before starting the next; never build `IN` from every matching id.
- Set `lock_timeout` and `statement_timeout`, and keep the total run below its distributed-lock TTL.


## Stop condition

Before shipping concurrent code, confirm: locked DDL? atomic + race-safe replace? idempotent re-run? loud failure? If any answer is no, fix it — the failure mode is silent data corruption, which lint and types will not catch.
