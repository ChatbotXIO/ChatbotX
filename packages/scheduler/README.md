# @aha.chat/scheduler

Scheduler client for managing sequence dispatches with Redis/Dragonfly.

## Usage

### Using the legacy DragonflyClient (backward compatible)

```typescript
import { initializeDragonfly } from "@aha.chat/scheduler"

// Initialize the client (uses sequenceConnections from @aha.chat/redis)
const client = await initializeDragonfly()

// Add a dispatch to schedule
await client.addToSchedule(bucket, dispatchId, runAtMs)

// Remove from schedule
await client.removeFromSchedule(bucket, dispatchId)
```

### Using the new SchedulerClient (recommended)

```typescript
import { SchedulerClient } from "@aha.chat/scheduler"
import { sequenceConnections } from "@aha.chat/redis"

// Create client with your own Redis instance
const redisClient = await sequenceConnections.useExisting()
const scheduler = new SchedulerClient(redisClient)

// Use the scheduler
await scheduler.addToSchedule(bucket, dispatchId, runAtMs)
```

## API

### SchedulerClient

Generic scheduler client that accepts any Redis client.

**Constructor:**
- `new SchedulerClient(client: Redis)` - Create a new scheduler with a Redis client

**Methods:**
- `addToSchedule(bucket, dispatchId, runAtMs)` - Schedule a dispatch
- `addToRetry(bucket, dispatchId, retryAtMs)` - Add to retry queue
- `removeFromSchedule(bucket, dispatchId)` - Remove from schedule
- `removeFromRetry(bucket, dispatchId)` - Remove from retry queue
- `removeFromAll(bucket, dispatchId)` - Remove from both queues
- `getDue(key, nowMs, limit)` - Get due dispatches
- `acquireLock(bucket, dispatchId, lockTtlMs)` - Acquire a lock
- `releaseLock(bucket, dispatchId)` - Release a lock
- `getScheduleCount(bucket)` - Get schedule queue count
- `getRetryCount(bucket)` - Get retry queue count
- `batchAddToSchedule(items)` - Batch add to schedule
- `batchRemoveFromAll(items)` - Batch remove from all queues
- `getZSetMembers(bucket, type)` - Get all members from a queue
- `isConnected()` - Check if Redis is connected
- `isConnectingOrConnected()` - Check if Redis is connecting or connected

### DragonflyClient (Legacy)

Extends SchedulerClient with connection management. Uses `sequenceConnections` from `@aha.chat/redis`.

**Functions:**
- `initializeDragonfly()` - Initialize and connect the client
- `getDragonflyClient()` - Get the singleton instance (must call `initializeDragonfly()` first)
- `resetDragonflyClient()` - Reset the singleton instance
