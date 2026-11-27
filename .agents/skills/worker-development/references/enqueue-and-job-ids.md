# Enqueuing Jobs and Job IDs

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
