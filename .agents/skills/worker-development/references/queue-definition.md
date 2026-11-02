# Creating a New Queue

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
