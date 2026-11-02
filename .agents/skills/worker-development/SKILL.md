---
name: worker-development
description: >-
  Use when adding or changing a BullMQ queue, job type, consumer, or scheduled job
  — job types in `packages/worker-config`, handlers in `apps/worker/src`. Covers
  consumer registration, `withBlockedOwnerGuard` for workspace-scoped jobs, and
  retries. Pair with `reliability-concurrency` for idempotency and locks.
---

# Worker Development

## Architecture

Workers consume BullMQ jobs in `apps/worker/`. The image defaults to
`worker standalone`, which starts core consumers, schedules, and sequence
workers in one Node process to load the application graph once. `worker core`
starts only core consumers for local development; `worker all` retains one
process per entry and applies `WORKER_MAX_OLD_SPACE_MB` only when explicitly
set. Consolidated and individually selected workers retain V8's normal heap
limit. Use `worker <name>` to isolate a workload when needed.

Every entry registers its closer with `src/lib/shutdown.ts`; never install a
per-entry signal handler or call `process.exit()` from an entry. The shared
coordinator drains all registered workers on `SIGINT`/`SIGTERM`; `worker
standalone` and `worker core` default `WORKER_SHUTDOWN_TIMEOUT_MS` to 8 seconds,
while other modes drain until complete unless that variable is set.

**Shared config** lives in `packages/worker-config/` (`@chatbotx.io/worker-config`).
Check `apps/worker/tsdown.config.ts` for the authoritative entry list.

## Workflow: new queue / job / consumer

1. **Queue name** — add the member to the `queueNames` zod enum in `packages/worker-config/src/lib/types.ts`; refer to it as `queueNames.enum.myQueue`.
2. **Job types and queue** — `packages/worker-config/src/queues/<name>/index.ts`, exported from `packages/worker-config/src/index.ts`. Samples: [queue-definition](references/queue-definition.md).
3. **Worker** — copy `apps/worker/src/notification/worker.ts` to `apps/worker/src/<domain>/worker.ts`; use `createQueueWorker` + `runWorker`, never a hand-rolled `new Worker(…)`, `ensureBootstrapped()` or `failed` listeners. Change the queue, the `Job<MyQueueJobData>` type, the `switch (job.data.type)` body (with `default: return`), and the concurrency env var.
4. **Register in three places** — import in `apps/worker/src/core.ts` (or `standalone.ts` for cron/sequence-like workers), add the tsdown entry, add it to the existing-workers table. Plus a dev script in `apps/worker/package.json`. Details: [worker-registration](references/worker-registration.md).
5. **Producer** — `myQueue.add(...)` / `addBulk` from `@chatbotx.io/worker-config`. See [enqueue-and-job-ids](references/enqueue-and-job-ids.md).
6. **Cron job** — four-edit flow (`ScheduleJobData`, handler, `case` in `src/schedule/worker.ts`, `upsertJobScheduler`). See [scheduled-jobs](references/scheduled-jobs.md).

The `heavy` queue is a workload-class queue (RAM/CPU/I/O/model-heavy jobs); see [existing-workers](references/existing-workers.md).

## Traps

- **Do not drop `withBlockedOwnerGuard`.** Every workspace-scoped processor must wrap its body in it (repo invariant 15) — a template without it is the single most common mistake here.
- **`jobId` must NOT contain `:`** — BullMQ throws `Custom Id cannot contain :`. Use `-`/`_`; keep ids deterministic and whitespace-free (e.g. `schedule-prepare-broadcast-<id>`).
- **Dedup jobs**: `removeOnComplete: { age, count }`, never `removeOnComplete: true`. **Re-driveable (cron) jobs**: `removeOnComplete: true` + `removeOnFail: true`.
- **Never reuse an active job's `jobId`** for a self-requeue inside that same job — BullMQ drops the add. Drive continuation from a separate cron.
- **Mocked `queue.add` does not validate `jobId`** — assert it contains no `:`, and prefer one integration test against real (or `ioredis-mock`) BullMQ.
- **Unknown job action** is a no-op (`default: return`), not a throw.
- **A worker not imported by an entry point never runs** under `worker standalone` — do all three registration steps.
- **Cron handlers that mutate shared state** wrap their body in `distributedLock.runExclusive({ key, timeoutInSeconds, fn })`; the TTL must be shorter than the schedule cadence. When changing `purgeWorkspaces`, also read `workspace-purge`.
- **Never `console`**; never a per-entry signal handler or `process.exit()`.

### Blocked-owner guard

Every workspace-scoped processor should resolve its workspace with
`resolveWorkspaceId` and gate execution with `withBlockedOwnerGuard` (or the
worker helper built on it). A blocked owner is a safe-return no-op: return
without throwing so BullMQ acknowledges the job without retry/DLQ. Jobs that
cannot be attributed to a workspace remain deliberately fail-open. System,
quota, and tenancy lifecycle jobs are excluded from this gate.

Every new workspace-scoped worker or consumer must wrap its processor with
`withBlockedOwnerGuard`. A blocked owner must use a bare `return`, never throw:
throwing would retry or dead-letter a job that is intentionally skipped, while
the bare return is also HTTP-200-safe because a webhook has already returned
before its job runs. `resolveWorkspaceId` uses a direct workspace fast path,
then nested workspace data and integration identifiers, with payload fallbacks
such as `conversationId` and `importId`.

The guard excludes system/quota/tenancy work: `sendAuditLog`, the
`error-log:recorded` event-bus listener, and schedule cron jobs, except the
broadcast handlers that operate on workspace-owned broadcast work (`prepareBroadcast`, `processBroadcastContacts` and
`materializeRecurringBroadcasts`, which advances the series with a `skipped/blockedOwner` ledger row instead of a bare `return`). Observability jobs stay unguarded so blocked
jobs can still report failures.

## Worker Imports

| What | Import from |
|------|-------------|
| Queue names, job types | `@chatbotx.io/worker-config` |
| Redis connection, options | `@chatbotx.io/worker-config` |
| Database | `@chatbotx.io/database/client` |
| Integration handlers | `../services/integrations` (within worker) |
| Logger | `@chatbotx.io/logger` |
| SDK types | `@chatbotx.io/sdk` |

## Logging

Import `logger` from `apps/worker/src/lib/logger.ts` (a `getChildLogger("worker")` child);
never use `console`. Log errors as `{ err, jobId: job?.id }` — the key is `err`, not `error`
(repo invariant 20 in `AGENTS.md`).

## Environment

- Workers load env via `dotenv -e ../../.env` (root `.env` file)
- Redis URL configured in `packages/worker-config/src/keys.ts`
- `fakeQueue` stubs are used during Next.js production build to avoid Redis requirement

## Verification

- `pnpm lint` and `pnpm --filter worker check-types` (plus `@chatbotx.io/worker-config` if touched).
- Unit-test the processor and assert produced `jobId`s.

## References

- [references/existing-workers.md](references/existing-workers.md) — table of current workers/queues/entries; read to find the right host worker or the `heavy` queue rules.
- [references/queue-definition.md](references/queue-definition.md) — `queueNames` enum, job-type/queue code sample, package export; read when creating a queue.
- [references/worker-registration.md](references/worker-registration.md) — worker template steps, three-place registration, tsdown entry, dev script.
- [references/enqueue-and-job-ids.md](references/enqueue-and-job-ids.md) — producer samples, custom job id/dedup rules, retention policies, job-id test pitfalls.
- [references/scheduled-jobs.md](references/scheduled-jobs.md) — cron lock rule, four-edit schedule-handler flow, sequence scheduling internals.
