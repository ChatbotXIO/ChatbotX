# ADR 0004: Messaging substrate scaling path

## Status

Accepted

Date: 2026-09-23

## Context

ChatbotX removed its unused Kafka package in ADR 0001 and today runs every queue,
event stream, cache, lock, and scheduler zset on a single Redis-compatible server. As
chat and background-job volume grows, that single instance becomes a scaling and
durability bottleneck. This ADR records the substrate that replaces it and the
prerequisites that must be correct regardless of which transport eventually wins.

Grounding facts, verified against the code at the time of this decision:

- All 13 active BullMQ queues use the hot/bulk split: hot is `integration`,
  `chat`, `notification`, `low`, `callTranscription`, and
  `whatsappVoipSignaling`; bulk is `aiAgent`, `heavy`, `default`, `schedule`,
  `trigger`, `webhook`, and `quota`. `sequenceScheduler` stays on its dedicated
  `sequenceConnections` client.
- The default hot `getRedisConnection()` is also used by event-bus streams,
  `packages/events` cache, heavy-step-runner, and provider-rate-limiter keys.
  Setting `REDIS_QUEUE_URL` moves those Streams and plain KV users too.
- `packages/event-bus` is already Redis **Streams** with consumer groups, `XAUTOCLAIM`
  reclaim, `max_deliveries`, and a DLQ (`packages/event-bus/src/event-bus.ts`), not
  pub/sub. Its ceiling is `MAXLEN` retention, not throughput.
- `packages/redis/src/bloom-filter.ts` issues `BF.RESERVE` / `BF.ADD` on the **cache**
  connection (`packages/redis/src/index.ts`, `cacheConnections`). It is load-bearing
  for MAC counting (`packages/analytics/src/services/mac-tracking.service.ts`). Plain
  `valkey/valkey` has no bloom commands (they live in the separate `valkey-bloom`
  module); Dragonfly implements `BF.*` natively; `redis:8-alpine` bundles them. **The
  cache role cannot move to plain Valkey.**
- `docker-compose.yml`'s `redis` service ran the official image with no `command:` —
  no AOF, RDB snapshots only.
- `packages/business/src/conversation/service.ts` wrote `Conversation.lastActivityAt`
  unconditionally in `updateFlowStepState`, while sibling call sites
  (`bulkAdvanceActivityAndAiContextMarker`, `contactInboxService.updateTracking`)
  already used advance-only guards. Concurrent inbound processing could move a
  conversation's `lastActivityAt` backwards.
- `apps/worker/src/sequence-scheduler/worker-producer.ts` removed a claimed dispatch
  from its zset before publishing it; a publish failure was only caught by the tick
  wrapper, leaving the dispatch recoverable solely via the hourly reconcile timer.
- `apps/worker/src/sequence-scheduler/worker-consumer.ts` swallowed every processing
  error inside its BullMQ handler, so BullMQ marked the job completed and never
  retried a genuinely failed dispatch.
- `packages/worker-config/src/message-queue/bullmq-provider.ts` logged failed jobs with
  `console.error`, violating the repository's structured-logging invariant (the
  serializer key is `err`, not `error`).

## Decision

### Tier-1 (now → the triggers below): keep BullMQ, split Redis by role

BullMQ is retained. Re-implementing its investment on a log transport is not
justified today: 49 `IntegrationJobAction` values, 28 registered `upsertJobScheduler`
cron entries (`apps/worker/src/schedule/handlers/register-schedules.ts`), delayed
jobs, per-action retry/priority policy
(`packages/worker-config/src/queues/integration/index.ts`), and `QueueEvents`-based
job waits. Neither Kafka nor JetStream provides per-job delay and cron scheduling —
replacing BullMQ means writing a scheduler, not swapping a transport.

**BullMQ is not Redis-Cluster-scalable.** Each queue's keys must live in one hash
slot, so horizontal growth is achieved by splitting queue groups across instances,
not by clustering a single queue. Do not plan a cluster migration for the queue role.

Instead, queues split into a **hot** group (`integration`, `chat`, `notification`,
`low`, `callTranscription`, `whatsappVoipSignaling` — latency-sensitive) and a
**bulk** group (`aiAgent`, `heavy`, `default`, `schedule`, `trigger`, `webhook`,
`quota` — background and export work that can burst).
`getRedisConnection(group: "hot" | "bulk")`
(`packages/worker-config/src/lib/connection.ts`) resolves each group's URL
independently, falling back through `REDIS_QUEUE_BULK_URL` → `REDIS_QUEUE_URL` →
`REDIS_URL` for bulk and `REDIS_QUEUE_URL` → `REDIS_URL` for hot. The
`sequenceScheduler` queue keeps its dedicated `sequenceConnections` connection.

redlock-universal's auto-extension failure only aborts a signal that this wrapper
does not observe, so lock extension is advisory rather than a guarantee.

### Per-role substrate matrix

| Role | Env | Commands needed beyond core | Substrate |
|---|---|---|---|
| Queue (hot + bulk) | `REDIS_QUEUE_URL`, `REDIS_QUEUE_BULK_URL` | BullMQ Lua, Streams, plain KV | Valkey 8+ (BSD, `io-threads`) |
| Sequence | `REDIS_SEQUENCE_URL` | zset + Redlock | Valkey 8+ |
| Cache / lock / MAC | `REDIS_CACHE_URL` | **`BF.RESERVE`, `BF.ADD`** | Dragonfly (native `BF.*`) or `redis:8` or Valkey + `valkey-bloom` |
| Event streams | `REDIS_QUEUE_URL` → `REDIS_URL` (shares the hot connection) | Streams + consumer groups | Valkey 8+ until tier-2 |

Evidence for the cache row: `packages/redis/src/bloom-filter.ts` issues `BF.RESERVE`
and `BF.ADD` on the `cacheConnections` client
(`packages/redis/src/index.ts`). A single-URL deployment is therefore only valid on a
module-capable server — which is why the default OSS compose stays on
`redis:8-alpine` rather than switching to plain Valkey.

### Tier-2: NATS JetStream, not Kafka/Redpanda

When a bus or the ingress path outgrows Redis Streams (see the numeric triggers
below), the durable event/ingress log moves to **NATS JetStream**, chosen for:

- Apache-2.0 under the CNCF (the 2025 Synadia/CNCF dispute ended with the server
  staying Apache-2.0, so there is no BUSL risk for a self-hosted OSS deployment).
- A single ~20 MB binary an OSS self-hoster can run without a JVM or a broker
  cluster.
- **File-backed** stream retention — the specific capability Redis Streams lacks.
- Subject-based partitioning for ordered consumption.
- Explicit-ack work queues with `max_deliver`, and a built-in KV store.

Redpanda was rejected for tier-2: BSL licensing plus its RAM/CPU baseline is a poor
fit for the self-host audience, and its only real advantage — Kafka wire-protocol
compatibility — is worthless until a deployment already runs Kafka. Kafka itself was
already rejected once, in ADR 0001.

### The two swap seams

Tier-2 is a provider implementation behind two existing seams, not a rewrite:

1. **`BaseEventBus`** (`packages/event-bus/src/event-bus.ts`) — `emit` /
   `startConsuming` / `cloneForGroup` / `stop`. Mapping: `streamKey` → JetStream
   stream, `consumerGroup` → durable consumer, `maxDeliveries` → `max_deliver`,
   `deadLetterStreamKey` → dedicated DLQ stream, `claimIdleMs` → `ack_wait`. The
   per-listener acknowledgement contract in `processAndAck` must be preserved,
   including that `enableSelectiveRetry: false` currently acks a failed batch — a
   JetStream provider must reproduce that behavior or deliberately change it, and the
   change must be recorded in its own ADR.
2. **Ingress** — `IntegrationJobReceiveMessage`
   (`packages/worker-config/src/queues/integration/index.ts`) is the ingress
   envelope, and **`integrationIdentifier` is the partition key**. It is already
   present on every inbound job, needs no producer change, and per-page ordering is a
   superset of per-conversation ordering, so one ordered consumer per partition
   yields real FIFO per conversation — replacing today's best-effort lock.

### Numeric triggers

Stated as formulas against real config so they can be evaluated from a dashboard
rather than argued about:

- **Split queue groups further / move the split off `REDIS_QUEUE_BULK_URL`
  unset-default:** when the queue Redis instance sustains >60% of one core, or p99
  `Queue.add` latency from the builder exceeds 25 ms.
- **Move an event bus to JetStream:** `events:message` is capped at `MAXLEN ~100_000`
  (`packages/event-bus/src/message/event-bus.ts`); `events:analytics-dashboard` at
  500,000 (`packages/event-bus/src/dashboard/event-bus.ts`). Retention in minutes ≈
  `maxLen / (events_per_second × 60)`. Migrate a bus when its computed retention drops
  below the longest consumer outage the deployment must survive without data loss —
  recommended floor 60 minutes.
- **Move ingress to JetStream:** when inbound webhook volume makes an at-most-1-second
  AOF `everysec` loss window unacceptable, or when per-conversation ordering must be
  guaranteed rather than best-effort.

## Consequences

- The cache role can never move to plain Valkey while `bloom-filter.ts` uses `BF.*`.
- Enabling `REDIS_QUEUE_BULK_URL` on a running deployment requires draining the bulk
  queues first: in-flight jobs and registered `upsertJobScheduler` entries live on the
  old instance and do not migrate automatically.
- The reference `docker-compose.yml` `redis` service now runs with `--appendonly yes
  --appendfsync everysec`, bounding data loss on an unclean stop to at most ~1 second
  of writes instead of losing everything queued since the last RDB snapshot.
- `saveAndBroadcastMessage` (`apps/worker/src/integration/handlers/received-message.ts`)
  now serializes its insert → tracking → realtime → notification → event-bus critical
  section per conversation via `distributedLock`, keyed `ingress:conv:${conversationId}`.
  This is best-effort: a lock acquisition failure degrades to unlocked processing
  rather than failing the job, because the `integration` queue only allows 2 attempts.
  Real, guaranteed per-conversation ordering arrives with tier-2's
  `integrationIdentifier` partitioning, not before.
- `Conversation.lastActivityAt` updates in `updateFlowStepState` are now advance-only
  (`GREATEST` against the existing value), matching the pattern already used by
  `bulkAdvanceActivityAndAiContextMarker` and `contactInboxService.updateTracking`.
  `currentStep` and `lastStep` remain unconditional writes.
- The sequence-scheduler producer re-inserts claimed dispatches into their zset when
  `publishDispatches` fails, instead of relying solely on the hourly reconcile timer.
  The sequence-scheduler consumer now propagates unhandled processing errors so BullMQ
  retries the job, instead of silently marking a failed dispatch as completed;
  malformed-payload guards (unparseable JSON, missing `workspaceId`) remain
  non-retrying by design.
- Tier-2 requires its own ADR for the provider implementation, mirroring ADR 0001's
  rule that reviving a transport needs a wired implementation plus a new decision
  record — not a resurrected dependency.

See `docs/scaling-messaging.md` for the operational deployment topology, the drain
procedure, and the retention-formula worked example.
