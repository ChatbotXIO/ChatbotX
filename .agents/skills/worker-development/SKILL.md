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
| default | `default` | `src/default/worker.ts` |
| trigger | `trigger` | `src/trigger/worker.ts` |
| webhook | `webhook` | `src/webhook/worker.ts` |
| schedule | (cron) | `src/schedule/worker.ts` |
| sequence-scheduler | Kafka | `src/sequence-scheduler/worker*.ts` |

## Creating a New Queue

### 1. Define Queue Name

Add to `packages/worker-config/src/lib/types.ts`:

```typescript
export const queueName = {
  // ...existing
  myQueue: "myQueue",
} as const
```

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

Create `apps/worker/src/<domain>/worker.ts`:

```typescript
import { Worker, type Job } from "bullmq"
import { queueNames } from "@chatbotx.io/worker-config"
import {
  getRedisConnection,
  defaultWorkerOptions,
} from "@chatbotx.io/worker-config"
import type { MyQueueJobData } from "@chatbotx.io/worker-config"
import { MyQueueJobAction } from "@chatbotx.io/worker-config"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "@chatbotx.io/logger"

const startMyWorker = async () => {
  try {
    await ensureBootstrapped()
    logger.info("My worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap my worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.myQueue,
    async (job: Job<MyQueueJobData>) => {
      logger.info(job.data, "Worker received job")

      switch (job.data.type) {
        case MyQueueJobAction.processItem:
          return await handleProcessItem(job.data.data)
        case MyQueueJobAction.syncData:
          return await handleSyncData(job.data.data)
        default:
          return
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Job failed")
  })

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed")
  })
}

startMyWorker()
```

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

Scheduled work follows four touchpoints:

1. Add a `ScheduleJobData` const, its inferred type, and the union entry in
   `packages/worker-config`.
2. Register the cadence with `upsertJobScheduler` in `register-schedules.ts`.
3. Import the handler and add its `case` in `schedule/worker.ts`.
4. Implement the handler in `schedule/handlers/<name>.ts`.

Handlers that mutate shared state must wrap their body in
`distributedLock.runExclusive({ key, timeoutInSeconds, fn })`. The TTL must be
shorter than the schedule cadence so concurrent worker replicas cannot overlap.

Every workspace-scoped processor should resolve its workspace with
`resolveWorkspaceId` and gate execution with `withBlockedOwnerGuard` (or the
worker helper built on it). A blocked owner is a safe-return no-op: return
without throwing so BullMQ acknowledges the job without retry/DLQ. Jobs that
cannot be attributed to a workspace remain deliberately fail-open. System,
quota, and tenancy lifecycle jobs are excluded from this gate.

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

Import the child logger from `../../lib/logger` inside `apps/worker`, or `@chatbotx.io/logger` for shared packages.

**Always use `err` (not `error`) as the key for Error objects.**

pino's built-in serializer is keyed on `err`. Using any other key (e.g. `error`) skips serialization, so the stack trace and error message are lost from structured logs.

```typescript
// ✅ correct — stack trace preserved
logger.error({ err: error, conversationId }, "Failed to emit analytics event")

// ❌ wrong — object serialized as [Object] with no stack trace
logger.error({ error, conversationId }, "Failed to emit analytics event")
```

For fire-and-forget `.catch()` handlers on analytics/event-bus emissions, always log the error rather than swallowing it:

```typescript
emit("analytics:dashboard", payload).catch((err) => {
  logger.error({ err, conversationId }, "[handler] Failed to emit analytics event")
})
```

## Environment

- Workers load env via `dotenv -e ../../.env` (root `.env` file)
- Redis URL configured in `packages/worker-config/src/keys.ts`
- `fakeQueue` stubs are used during Next.js production build to avoid Redis requirement
