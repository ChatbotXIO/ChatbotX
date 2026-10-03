# Scaling the messaging substrate

Operational companion to `docs/adr/0004-messaging-substrate-scaling-path.md`. This
document does not restate the decision — see the ADR for the rationale and the
tier-2 swap seams. It covers deployment topology, the drain procedure, and the
retention-formula worked example.

## Deployment topology

| Role | Env var (falls back in order) | Image for a module-capable OSS deploy | Why |
|---|---|---|---|
| Queue — hot (`integration`, `chat`, `notification`, `low`, `callTranscription`, `whatsappVoipSignaling`) | `REDIS_QUEUE_URL` → `REDIS_URL` | `redis:8-alpine` or Valkey 8+ | Latency-sensitive BullMQ, event-stream, and plain-KV work. |
| Queue — bulk (`aiAgent`, `heavy`, `default`, `schedule`, `trigger`, `webhook`, `quota`, `profileSnapshot`) | `REDIS_QUEUE_BULK_URL` → `REDIS_QUEUE_URL` → `REDIS_URL` | `redis:8-alpine` or Valkey 8+ | Background/export work that can burst; isolating it protects hot-path latency. |
| Sequence scheduler | `REDIS_SEQUENCE_URL` → `REDIS_URL` | `redis:8-alpine` or Valkey 8+ | zset + Redlock coordination across 256 hash buckets. |
| Cache / distributed lock / MAC bloom filter | `REDIS_CACHE_URL` → `REDIS_URL` | `redis:8-alpine`, or Dragonfly, or Valkey **with** `valkey-bloom` loaded | `packages/redis/src/bloom-filter.ts` issues `BF.RESERVE`/`BF.ADD`. Plain `valkey/valkey` rejects these commands and silently breaks MAC counting. |
| Event streams (`events:message`, `events:analytics-dashboard`, `events:error-log`, `flow:events`) | `REDIS_QUEUE_URL` → `REDIS_URL` (shares hot) | `redis:8-alpine` or Valkey 8+ until tier-2 | Redis Streams with consumer groups; ceiling is `MAXLEN` retention, not throughput. |

The `sequenceScheduler` BullMQ queue always uses `sequenceConnections`
(`packages/redis/src/connections/sequence-connection.ts`) — it is never affected by
the hot/bulk queue-group split described below.

Every URL is optional and falls back to `REDIS_URL`, so a fresh clone with no
role-specific env vars set runs today's single-instance topology unchanged.

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
