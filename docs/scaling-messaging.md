# Scaling the messaging substrate

Operational companion to `docs/adr/0004-messaging-substrate-scaling-path.md`. This
document does not restate the decision — see the ADR for the rationale and the
tier-2 swap seams. It covers deployment topology, the drain procedure, and the
retention-formula worked example.

## Deployment topology

| Role | Env var (falls back in order) | Image for a module-capable OSS deploy | Why |
|---|---|---|---|
| Queue — hot (`integration`, `chat`, `notification`, `low`, `callTranscription`, `whatsappVoipSignaling`) | `REDIS_QUEUE_URL` → `REDIS_URL` | `redis:8-alpine` or Valkey 8+ | Latency-sensitive BullMQ, event-stream, and plain-KV work. |
| Queue — bulk (`aiAgent`, `heavy`, `default`, `schedule`, `trigger`, `webhook`, `quota`, `profileSnapshot`, `leaderboard`) | `REDIS_QUEUE_BULK_URL` → `REDIS_QUEUE_URL` → `REDIS_URL` | `redis:8-alpine` or Valkey 8+ | Background/export work that can burst; isolating it protects hot-path latency. |
| Sequence scheduler | `REDIS_SEQUENCE_URL` → `REDIS_URL` | `redis:8-alpine` or Valkey 8+ | zset + Redlock coordination across 256 hash buckets. |
| Cache / distributed lock / MAC bloom filter | `REDIS_CACHE_URL` → `REDIS_URL` | `redis:8-alpine`, or Dragonfly, or Valkey **with** `valkey-bloom` loaded | `packages/redis/src/bloom-filter.ts` issues `BF.RESERVE`/`BF.ADD`. Plain `valkey/valkey` rejects these commands and silently breaks MAC counting. |
| Event streams (`events:message`, `events:analytics-dashboard`, `events:error-log`, `flow:events`) | `REDIS_QUEUE_URL` → `REDIS_URL` (shares hot) | `redis:8-alpine` or Valkey 8+ until tier-2 | Redis Streams with consumer groups; ceiling is `MAXLEN` retention, not throughput. |
| Realtime streams + revoke markers | `REDIS_REALTIME_URL` → `REDIS_URL` | `redis:8-alpine` or Valkey 8+ | Streams without consumer groups; capped at five-minute retention, so an eviction-tolerant configuration is acceptable. |

The `sequenceScheduler` BullMQ queue always uses `sequenceConnections`
(`packages/redis/src/connections/sequence-connection.ts`) — it is never affected by
the hot/bulk queue-group split described below.

Every URL is optional and falls back to `REDIS_URL`, so a fresh clone with no
role-specific env vars set runs today's single-instance topology unchanged.

## Worker process modes

The worker image defaults to `worker standalone`, which co-locates core queue
consumers, the schedule worker, and sequence workers in one Node process. This
loads the shared application graph once and is the appropriate topology for a
memory-constrained single-node deployment.

Use `worker core` while developing to omit schedules and sequence processing.
Use `worker <name>` to isolate a workload when CPU, event-loop latency, or
database-pool contention requires it; `worker heavy` is the usual candidate.
`worker all` remains available for the legacy one-process-per-worker topology.
Set `WORKER_MAX_OLD_SPACE_MB` to cap each child process; it has no default and
does not cap `standalone` or individually selected workers. Consolidated modes
default `WORKER_SHUTDOWN_TIMEOUT_MS` to 8 seconds. Other modes drain until the
orchestrator stops them unless that variable is set; keep any configured
deadline below the orchestrator stop grace period.

Set the orchestrator stop grace period to at least
`WORKER_SHUTDOWN_TIMEOUT_MS` + 2 seconds; about 30 seconds is a sensible value
for consolidated mode. A job still running at the deadline is not lost: the
integration and heavy workers keep their long job locks (10 minutes for
integration, at least 5 minutes for heavy), so BullMQ redelivers an abandoned
job once its lock expires. The locks stay long because `standalone` shares one
event loop, so a job must not be redelivered while it is still running.
A fatal error (`uncaughtException`/`unhandledRejection`) drains for at most 30
seconds when `WORKER_SHUTDOWN_TIMEOUT_MS` is unset.

### Database pool sizing

`DATABASE_POOL_MAX` and `SHARD_POOL_MAX` control PostgreSQL connections per
process and default to `10`. The worker Docker entrypoint defaults
`DATABASE_POOL_MAX` to `80` and `SHARD_POOL_MAX` to `40` for the consolidated
`worker standalone` and `worker core` modes; an explicit value wins. Size
replicas so that

```text
replicas × (DATABASE_POOL_MAX + shards × SHARD_POOL_MAX) ≤ max_connections
```

Those processes share each pool across about 350 concurrent job slots in total
(trigger `100`, sequence `100`, webhook `50`, …):
raise the pool limits or lower `*_WORKER_CONCURRENCY` — especially trigger
(`100`), webhook (`50`), and low (`30`) — while keeping total connections across
builder, worker, realtime, MCP, and isolated worker processes below PostgreSQL
`max_connections`.

**Leaderboard rankings live on the cache role.** `lb:{id}:rank` sorted sets
(~100 bytes per participant, measured on Redis 8; only for active/paused
leaderboards) use `REDIS_CACHE_URL`. With no `REDIS_CACHE_URL` they share the
BullMQ instance, which must run `noeviction` — so if memory fills, writes fail
for the queues too. The hourly `maintainLeaderboardRankings` cron logs Redis
`used_memory` and errors above 512 MB. For many large leaderboards, give the
cache role its own instance with `maxmemory` + `allkeys-lru`: the rankings are
rebuilt from Postgres on demand, so eviction is safe there. See
`docs/leaderboard.md`.

## Queue design & tuning

How a customer's message becomes a reply, and which knobs move latency.

**One job per flow step.** Every step of a flow is its own `sendFlow` job on the
`integration` queue. A step that sends a message holds its integration slot while it
waits for the `chat` queue to finish the send (`waitForChatJobCompletion`, up to
`CHAT_JOB_WAIT_TIMEOUT_MS`, default 120 s). The next step runs when the provider
accepted the send, not when the delivered webhook arrives. So an integration slot is
mostly idle I/O wait, and the `chat` queue looks nearly empty even when `integration`
is backed up. Throughput is roughly
`INTEGRATION_WORKER_CONCURRENCY ÷ round-trip of one send`.

**Priority ladder on `integration`.** BullMQ runs every unprioritized job before any
prioritized one; among prioritized jobs a lower number goes first.

| Priority | Jobs |
|---|---|
| none (0) | Live traffic: incoming messages, postbacks, quick replies, automated replies, and every step, branch or timer resume of those flow runs |
| `BROADCAST_SEND_PRIORITY` / `SEQUENCE_SEND_PRIORITY` (5) | Every step of a broadcast or sequence run (chosen by `metadata.type`) |
| `MISSED_COMMENT_REPLAY_PRIORITY` (10) | Missed-comment replays |

A running flow's next step deliberately has no priority: BullMQ takes a prioritized job
only when no unprioritized one is waiting, so a lower tier for continuations would let new
conversations stall a flow half-way through indefinitely under sustained load. Live jobs
stay in FIFO order with each other. `flowContinuationJobOptions` (`packages/worker-config`)
is the one place that maps a job's `metadata` to its tier; add new mass-send types to its
table.

**Bookkeeping ingress runs on `low`.** `enqueueIntegrationJob` routes read receipts
(`contactMarkAsRead`), delivery statuses (`messageStatus`) and channel echoes
(`incomingMessageEcho`: Messenger/Instagram `is_echo`, Zalo `oa_send_*`, TikTok
`im_send_msg`) to the `low` queue, where the `low` worker runs the same handlers.
Nobody waits on them, and each sent message otherwise adds two receipt jobs ahead of
the customer's next message. Two consequences:

- A delivery status stays on `integration` when it can continue a flow: a WhatsApp
  template whose Delivered/Failed button leads to another node. The chat worker records
  a marker (`messageStatusBranchService`, Redis, 24 hours) with the statuses whose button
  is wired when it sends such a template, and builder ingress stamps `continuesFlow` on
  a matching status (a `read` receipt, or a status whose button is not wired, goes to
  `low`). If the marker is
  missing (Redis down, expired) the status goes to `low` and the branch still runs, only
  later.
- Echoes and statuses can lag by the depth of `low`. Bulk producers on `low` (attachment
  mirroring, avatar mirroring, missed-comment replay) use `LOW_BULK_PRIORITY` so these
  always pass them. Read marks (`contactLastReadAt`) are advance-only, so concurrent or
  out-of-order receipts never move them back.

**Deploy order.** Ship the worker before the builder. The integration worker keeps the
old `messageStatus` / `contactMarkAsRead` cases to drain what is already queued, and the
`low` worker must understand the new routing before the builder produces it. A status
that was queued on `integration` before the switch and is redelivered afterwards can run
twice across the two queues during the cutover; the handlers are idempotent.

**Rollback order.** Roll back the builder before the worker. An older `low` worker does not
know the new job types: it logs `Unhandled low job type` and completes them, so receipts
and echoes routed to `low` by a newer builder would be dropped.

**Observing it.** The integration worker logs `Queue depth` every 60 s for
`integration`, `chat` and `low` (`waiting`, `prioritized`, `delayed`, `active`). Many
`waiting` on `integration` means more integration concurrency; many on `chat` means more
`CHAT_WORKER_CONCURRENCY`; `prioritized` holds broadcast, sequence and replay sends that
wait behind live traffic by design.

**Sizing for roughly 3,000–4,000 messages per hour with flows.** The defaults
(`INTEGRATION_WORKER_CONCURRENCY=10`, `CHAT_WORKER_CONCURRENCY=5`) are conservative
because every slot is a database connection. Start with integration `30`–`50` and chat
at least half of it, raise `DATABASE_POOL_MAX` per the formula in
[Database pool sizing](#database-pool-sizing), and run `worker integration`,
`worker chat` and `worker low` as separate processes so bookkeeping and sends never
share an event loop with flow execution.

## Enabling the hot/bulk queue split

1. Provision a second Redis/Valkey instance.
2. Set `REDIS_QUEUE_BULK_URL` in every process that enqueues or consumes bulk jobs: all
   worker processes (hot workers enqueue `aiAgent`/`heavy`; image-reader waits
   on heavy `QueueEvents`; the `low` worker also consumes `profileSnapshot`) and `apps/builder` (quota/default/heavy jobs and Bull
   Board).
3. **Drain the bulk queues before restarting workers on the new URL.** In-flight
   jobs and registered `upsertJobScheduler` repeatable-job entries live on the old
   instance's queue keys and are not migrated automatically — they would become
   invisible to a worker pointed at the new URL. Drain by:
   - Pausing non-schedule producers of new bulk jobs (or accepting the small window
     of jobs landing on the old instance during cutover).
   - Removing every old `schedule` job scheduler with BullMQ's
     `Queue.removeJobScheduler`, using the scheduler IDs registered in
     `apps/worker/src/schedule/handlers/register-schedules.ts`. Do this before
     checking queue depth and prevent the old schedule worker from registering them
     again. A recurring scheduler always leaves its next delayed job on the old
     instance, so the queue cannot otherwise drain.
   - Letting the old schedule worker process the remaining ordinary `schedule`
     jobs, then waiting for `aiAgent`, `heavy`, `default`, `schedule`, `trigger`,
     `webhook`, and `quota` to reach zero active + waiting + delayed jobs on the old
     instance (`redis-cli --scan --pattern 'bull:<queue>:*'` per queue, or the
     BullMQ dashboard).
   - Re-registering the cron entries once workers using `REDIS_QUEUE_BULK_URL` are
     up — `upsertJobScheduler` recreates them idempotently against the new instance.
4. Restart every producer and consumer with the new env var: all workers and
   `apps/builder`. The enterprise `quota-worker` consumes `quota` and must receive
   the same bulk URL.
5. Verify the split: `redis-cli --scan --pattern 'bull:heavy:*'` should return
   matches on the new instance and be empty on the old one; `bull:integration:*`
   should remain on the original instance.

Rolling back is symmetric: unset `REDIS_QUEUE_BULK_URL`, drain the bulk queues on the
dedicated instance the same way, and restart bulk workers.

## Retention formula, worked example

For a Redis Streams event bus:

```text
retention_minutes ≈ maxLen / (events_per_second × 60)
```

`events:message` is capped at `maxLen = 100_000`
(`packages/event-bus/src/message/event-bus.ts`). At a sustained 50 events/second:

```text
retention_minutes ≈ 100_000 / (50 × 60) ≈ 33 minutes
```

That is below the recommended 60-minute floor (the longest consumer outage the
deployment should survive without data loss), so at 50 events/second sustained,
`events:message` is a tier-2 JetStream migration candidate per the ADR's numeric
trigger. At 20 events/second the same stream retains ~83 minutes — above the floor,
no migration needed yet. Recompute this per deployment against its actual sustained
throughput, not peak.

`events:analytics-dashboard` is capped at `maxLen = 500_000`
(`packages/event-bus/src/dashboard/event-bus.ts`), giving five times the retention of
`events:message` at the same event rate.

## Cross-references

- `docs/adr/0004-messaging-substrate-scaling-path.md` — the decision, the two tier-2
  swap seams, and the full numeric-trigger list.
- `docs/request-workflow.md` — how oRPC/server-action requests reach Drizzle; the
  queue roles here sit downstream of those mutations.
- `docs/websocket.md` — realtime broadcast, which `saveAndBroadcastMessage`
  (`apps/worker/src/integration/handlers/received-message.ts`) calls inside the
  per-conversation ingress lock described in ADR 0004.
