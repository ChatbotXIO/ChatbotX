---
name: worker-development
description: >-
  Create and manage background workers, BullMQ queues, Kafka consumers, and
  scheduled jobs. Use when adding new workers, creating queues, defining job
  types, building scheduled tasks, or working with async processing.
---

# Worker Development

## Architecture

Workers run as separate Node processes in `apps/worker/`. They consume jobs from **BullMQ** queues (Redis-backed) or **Kafka** topics.

**Shared config** lives in `packages/worker-config/` (`@chatbotx.io/worker-config`).

## Existing Workers

| Worker | Queue/Topic | Entry |
|--------|------------|-------|
| integration | `integration` | `src/integration/worker.ts` |
| chat | `chat` | `src/chat/worker.ts` |
| ai-agent | `aiAgent` | `src/ai-agent/worker.ts` |
| heavy | `heavy` | `src/heavy/worker.ts` |
| default | `default` | `src/default/worker.ts` |
| trigger | `trigger` | `src/trigger/worker.ts` |
| webhook | `webhook` | `src/webhook/worker.ts` |
| schedule | (cron) | `src/schedule/worker.ts` |
| sequence-scheduler | Kafka | `src/sequence-scheduler/worker*.ts` |
| notification | `notification` | `src/notification/worker.ts` |
| events | event-bus (not BullMQ) | `src/events/worker.ts` — `startWorker([...listeners])` from `@chatbotx.io/event-bus/worker` |

`queueNames` (`packages/worker-config/src/lib/types.ts:3`) also declares `broadcast` and
`quota`, which have queues but no dedicated worker entry — their jobs are consumed by the
workers above. Check `apps/worker/tsdown.config.ts` for the authoritative entry list.

The `heavy` queue/worker is a **workload-class** queue, not a domain queue:
use it for bounded but RAM/CPU/I/O/model-heavy jobs that should not occupy
latency-sensitive domain workers. AI file processing, media generation,
speech/text conversion, document extraction, and image analysis are current
tenants. Future heavy workloads can join this queue with their own
`src/heavy/handlers/<domain-or-capability>/` handler area when the same
resource-isolation tradeoff applies.

## Creating a New Queue

### 1. Define Queue Name

Add the member to the `queueNames` **zod enum** in
`packages/worker-config/src/lib/types.ts` (it is a `z.enum([...])`, not an object literal —
there is no `queueName` symbol):

```typescript
export const queueNames = z.enum([
  // ...existing
  "myQueue",
])
```

Refer to it everywhere as `queueNames.enum.myQueue`.

### 2. Define Job Types

Create `packages/worker-config/src/queues/<name>/index.ts`:

```typescript
import { Queue } from "bullmq"
import { getRedisConnection, defaultJobOptions, fakeQueue } from "../../lib/connection"

export enum MyQueueJobAction {
  processItem = "processItem",
  syncData = "syncData",
}

type ProcessItemJob = {
  type: MyQueueJobAction.processItem
  data: { itemId: string; workspaceId: string }
}

type SyncDataJob = {
  type: MyQueueJobAction.syncData
  data: { source: string }
}

export type MyQueueJobData = ProcessItemJob | SyncDataJob

const NEXT_PHASE = process.env.NEXT_PHASE
export const myQueue =
  NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue(queueNames.enum.myQueue, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
```

### 3. Export from Package

Add to `packages/worker-config/src/index.ts`:

```typescript
export * from "./queues/<name>"
```

## Creating a New Worker

**Copy `apps/worker/src/notification/worker.ts`** — it is the smallest complete example and
already shows the shape you need: `ensureBootstrapped()`, `new Worker(queueNames.enum.<queue>,
…)`, a `withBlockedOwnerGuard(workspaceId, …)`-wrapped processor, `{ connection:
getRedisConnection(), ...defaultWorkerOptions, concurrency: env.<X>_WORKER_CONCURRENCY }`, and
`failed` / `completed` listeners.

Create `apps/worker/src/<domain>/worker.ts` from it and change four things:

1. The queue: `queueNames.enum.myQueue`.
2. The job type: `Job<MyQueueJobData>`.
3. The processor body — `switch (job.data.type)` over your `MyQueueJobAction` members, with a
   `default: return` so an unknown action is a no-op rather than a throw.
4. The concurrency env var, if the workload needs one.

**Do not drop `withBlockedOwnerGuard`.** Every workspace-scoped processor must wrap its body in
it (repo invariant 15) — a template without it is the single most common mistake here. See
"Blocked-owner guard" below for which jobs are exempt.

### Register Build Entry

Add to `apps/worker/tsdown.config.ts`:

```typescript
entry: [
  // ...existing
  "src/<domain>/worker.ts",
]
```

### Add Dev Script

Add to `apps/worker/package.json`:

```json
{
  "scripts": {
    "worker:<domain>": "dotenv -e ../../.env -- tsx --watch src/<domain>/worker.ts"
  }
}
```

Include in the `dev` script's concurrently list if needed.

## Enqueuing Jobs (Producer Side)

From builder or other apps:

```typescript
import { myQueue, MyQueueJobAction } from "@chatbotx.io/worker-config"

await myQueue.add("processItem", {
  type: MyQueueJobAction.processItem,
  data: { itemId: "123", workspaceId: "456" },
})

// Bulk enqueue
await myQueue.addBulk([
  {
    name: "syncData",
    data: { type: MyQueueJobAction.syncData, data: { source: "api" } },
  },
])
```

## Custom Job IDs & Deduplication

A custom `jobId` deduplicates work: a second `add` with an existing `jobId` returns the existing job instead of creating a new one (while that job is still present in the queue).

**CRITICAL — `jobId` must NOT contain `:`.** BullMQ uses `:` as its internal Redis key delimiter, so a custom id containing it throws at runtime: `Error: Custom Id cannot contain :`. Build ids from `-`/`_` plus the entity ids:

```typescript
// ✅ correct
const jobId = `broadcast-send-contact-${broadcastId}-${contactId}-${type}`
// ❌ runtime crash: "Custom Id cannot contain :"
const jobId = `bcast:${broadcastId}:${contactId}:${type}`
```

Keep ids deterministic (so retries / re-picks collapse onto the same job) and free of whitespace. The repo convention is `-`-separated (e.g. `schedule-prepare-broadcast-<id>`).

### Retention vs re-drive — two opposite `removeOnComplete` policies

- **Dedup job** (one-shot per entity, e.g. per-contact send): use `removeOnComplete: { age, count }` (TTL retention) so the id survives long enough to dedup concurrent / retry / crash-window re-adds. **Never `removeOnComplete: true`** — it removes the id immediately and reopens the duplicate window.
- **Re-driveable job** (a cron re-adds the same id every tick): use `removeOnComplete: true` + `removeOnFail: true` so the id frees after each run and the next tick can re-add it. Retention here would dedup the next tick away and stall the entity.

Never reuse an active job's `jobId` for a self-requeue created *inside* that same job — BullMQ drops the add (id already active) and the chain dies. Drive continuation from a separate cron instead.

### Testing job IDs (mock pitfall)

Unit tests usually mock `queue.add` as `vi.fn()`, which accepts **any** args — it does **not** validate the `jobId` like real BullMQ. A wrong id format (e.g. containing `:`) passes a self-consistent unit test (code and test agree on the bad string) but crashes at runtime. Always assert the produced `jobId` against the constraint:

```typescript
const jobIds = addSpy.mock.calls.map((c) => c[2].jobId)
for (const jobId of jobIds) expect(jobId).not.toContain(":")
```

For at least one enqueue path, prefer an integration test against real (or `ioredis-mock`) BullMQ to catch library-level input validation that mocks miss.

## Scheduled Jobs (Cron)

Handlers that mutate shared state must wrap their body in
`distributedLock.runExclusive({ key, timeoutInSeconds, fn })`. The TTL must be
shorter than the schedule cadence so concurrent worker replicas cannot overlap.

Every workspace-scoped processor should resolve its workspace with
`resolveWorkspaceId` and gate execution with `withBlockedOwnerGuard` (or the
worker helper built on it). A blocked owner is a safe-return no-op: return
without throwing so BullMQ acknowledges the job without retry/DLQ. Jobs that
cannot be attributed to a workspace remain deliberately fail-open. System,
quota, and tenancy lifecycle jobs are excluded from this gate.

### Adding a schedule handler

Use this four-edit flow, shown by the `purgeWorkspaces` handler:

1. Add the `ScheduleJobData` key, payload type, and union member in
   `packages/worker-config/src/queues/schedule/index.ts`.
2. Add `handlers/purge-workspaces.ts` (or the new handler name).
3. Add the corresponding `case` in `src/schedule/worker.ts`.
4. Register it with `upsertJobScheduler` in `handlers/register-schedules.ts`.

### Blocked-owner guard

Every new workspace-scoped worker or consumer must wrap its processor with
`withBlockedOwnerGuard`. A blocked owner must use a bare `return`, never throw:
throwing would retry or dead-letter a job that is intentionally skipped, while
the bare return is also HTTP-200-safe because a webhook has already returned
before its job runs. `resolveWorkspaceId` uses a direct workspace fast path,
then nested workspace data and integration identifiers, with payload fallbacks
such as `conversationId` and `importId`.

The guard excludes system/quota/tenancy work: `sendAuditLog`, the
`error-log:recorded` event-bus listener, and schedule cron jobs, except the two
broadcast handlers that operate on workspace-owned broadcast work. Observability jobs stay unguarded so blocked
jobs can still report failures.

## Kafka (Sequence Scheduler Pattern)

For high-throughput scenarios, the project uses Kafka:

- **Producer**: `createProducer` from `@chatbotx.io/kafka`
- **Consumer**: `createConsumer` from `@chatbotx.io/kafka`
- Topics defined as constants
- JSON serialization for payloads

Only used for sequence dispatch currently. Prefer BullMQ for standard job queues.

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
