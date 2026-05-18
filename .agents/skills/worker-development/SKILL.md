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

## Scheduled Jobs (Cron)

The schedule worker (`src/schedule/worker.ts`) runs periodic tasks. Add cron-style scheduled work there or use BullMQ's repeatable jobs:

```typescript
await myQueue.add(
  "syncData",
  { type: MyQueueJobAction.syncData, data: { source: "cron" } },
  { repeat: { pattern: "0 */6 * * *" } }, // every 6 hours
)
```

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

## Environment

- Workers load env via `dotenv -e ../../.env` (root `.env` file)
- Redis URL configured in `packages/worker-config/src/keys.ts`
- `fakeQueue` stubs are used during Next.js production build to avoid Redis requirement
