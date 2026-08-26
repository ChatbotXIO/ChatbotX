# Plan: Worker Queue Scaling & Reorganization

## Goal

The async job queue count is large and growing. This plan reorganizes queues for better SLA isolation, adds durability, and enables horizontal scaling.

---

## Current State

9 active queues, 11 worker processes. Core problems:

| Queue | Job types | Problem |
|-------|-----------|---------|
| `integration` | 16 types | Mega-monolith — AI calls starve incoming messages |
| `chat` | 7 types | Mixes realtime typing pings with bulk template blasts |
| `schedule` | 7 types | Cron polling mixed with broadcast pipeline |
| `default` | 3 types | CSV exports block audit log writes |

Global defaults causing pain:
- `concurrency: 5` for everything except `trigger` (100) — IO-bound outbound queues are severely throttled
- `attempts: 2` universally — too few for transient HTTP failures
- `removeOnFail: { count: 5000 }` with no DLQ — jobs are silently lost

---

## Top Risks (If Left As-Is)

| Risk | Severity |
|------|----------|
| `integration` head-of-line blocking — one AI call delays real user messages | HIGH |
| No WhatsApp/Messenger rate limiting — broadcast bursts can trigger provider suspension | HIGH |
| Silent job loss — no DLQ, audit log loss is a compliance risk | HIGH |
| No observability — first sign of backlog is user complaints | HIGH |
| Engineers keep adding to `integration` — split cost grows monthly | MEDIUM |

---

## Queue Tiers

Every queue must be assigned a tier. Each tier defines concurrency, retry, and SLA defaults.

| Tier | SLA | Concurrency template | Retry policy |
|------|-----|----------------------|--------------|
| `realtime` | < 1 s | 50–200 | 3 attempts, backoff: 500 ms / 2 s / 8 s |
| `interactive` | < 5 s | 20–50 | 3 attempts, backoff: 2 s / 10 s / 30 s |
| `bulk` | minutes | 10 + `limiter` | 5 attempts, backoff: 10 s / 60 s / 300 s |
| `background` | hours | 2–5 | 3 attempts, slow backoff |
| `cron` | minutes | 1 (singleton) | 1 attempt |
| `ai` | seconds–minutes | per-provider limiter | 2 attempts, no retry on quota errors |

---

## Phase 1 — Observability & Durability

**Goal:** Stop flying blind, stop losing jobs. No queue splits.

**Files to create/change:**
- `apps/builder/src/app/(dashboard)/admin/queues/route.ts` — Bull Board admin-only route
- `apps/worker/src/lib/metrics.ts` — Prometheus exporter (queue depth, latency p50/p95, fail rate)
- `packages/worker-config/src/queues/dlq/index.ts` — new dead-letter queue
- `packages/worker-config/src/lib/worker-runner.ts` — shared `withWorker(name, handlers, tier)` helper
- `apps/worker/src/*/worker.ts` — migrate each to use `withWorker`; DLQ push on final failure

**Alerts to wire:**
- DLQ depth > 0
- Per-tier queue depth thresholds exceeded for > T minutes
- Processing latency p95 > tier SLA

**Risk:** LOW — pure additive instrumentation, no behavior change.

---

## Phase 2 — Concurrency & Retry Tuning

**Goal:** Stop the most obvious head-of-line blocking with config changes only. No queue splits.

**Changes:**
1. Remove global `defaultWorkerOptions.concurrency = 5` in `packages/worker-config/src/lib/connection.ts`. Force each worker to declare its own.
2. Set per-queue concurrency:

| Queue | Concurrency | Notes |
|-------|-------------|-------|
| `inbound-events` (future) | 100 | IO-bound, light DB writes |
| `flow-execution` (future) | 30 | Mixed DB + provider calls |
| `bot-response` (future) | 10 + limiter | LLM latency, per-provider RPM |
| `chat` (current) | 50 | Raise from 5 until split in Phase 3 |
| `integration` (current) | 30 | Raise from 5 until split in Phase 3 |
| `aiAgent` | 3 | CPU/IO heavy, embedding API rate limits |
| `webhook` | 20 + limiter | Per-target-host fairness |
| `trigger` | 50 | Down from 100; verify with metrics |
| `analytics` | 5 | Batch jobs, mostly serial |
| `exports` (future) | 2 | Long-running, memory-heavy |
| `audit-log` (future) | 10 | Must not lose, cheap writes |
| `cron` (future) | 1 | Singleton-style |

3. Add per-job-type retry policy map in each queue file under `packages/worker-config/src/queues/*/index.ts`.
4. Add BullMQ `limiter` to `chat` (WA template jobs) and `webhook` workers.
5. Add `priority` to producers: `priority: 1` for `incomingMessage`, `runFlowPostback`, `runFlowQuickReply`; `priority: 10` for broadcast-originated jobs.

**Risk:** MEDIUM — concurrency changes affect DB connection pool sizing. Roll behind staged deploys and monitor Phase 1 dashboards first.

---

## Phase 3 — Split `integration` and `chat` Monoliths

**Goal:** Structural fix for head-of-line blocking and noisy-neighbor.

**New queues under `packages/worker-config/src/queues/`:**

| New queue | Job types from `integration` | Tier |
|-----------|------------------------------|------|
| `inbound-events` | `incomingMessage`, `messageStatus`, `contactMarkAsRead`, `agentMarkAsRead` | realtime |
| `flow-execution` | `sendFlow`, `runFlowPostback`, `runFlowQuickReply`, `runRef`, `runChallenge`, `sendSequenceFlow`, `createMessage` | interactive |
| `bot-response` | `processAutomatedResponse` | ai |
| `contact-admin` | `blockContact`, `unblockContact`, `assignConversation` | background |

| New queue | Job types from `chat` | Tier |
|-----------|-----------------------|------|
| `chat-outbound-realtime` | `sendChannelMessage`, `sendFlowMessage`, `sendChatMessage`, `sendTyping` | realtime |
| `chat-outbound-bulk` | `sendWhatsappTemplateMessage` | bulk (rate-limited) |
| `realtime-broadcast` | `broadcastEvent` | realtime |
| `chat-notifications` | `notifyExportResult` | background |

**Steps:**
1. Add new queue files and update `queueNames` enum in `packages/worker-config/src/lib/types.ts` (mark old as deprecated, do not remove yet).
2. Update producers at all 28 call sites. Use a thin routing shim during cutover so old action enums resolve to the new queue.
3. Add new worker processes under `apps/worker/src/` for each new queue.
4. Update `apps/worker/package.json` scripts.
5. Run old and new queues in parallel until old queues drain, then decommission.

**Risk:** MEDIUM–HIGH — many producer call sites. Mitigate with compatibility shim and keeping old workers alive for one release window.

---

## Phase 4 — Split `schedule` and `default`

**Goal:** Prevent cron jobs and audit writes from being held behind unrelated work.

**New queues:**
- `cron` ← `evaluateTriggers`, `cleanupTriggers`, `scanSmartDelay`, `finalizeBroadcasts`, `enqueueBroadcast`
- `broadcast-pipeline` ← `prepareBroadcast`, `sendBroadcast`
- `exports` ← `exportContacts`
- `audit-log` ← `sendAuditLog`
- `error-log` ← `sendErrorLog`

Introduce Redis-lock leader election for scheduler bootstrap (`apps/worker/src/cron/leader.ts`) so `upsertJobScheduler` only fires from one replica.

**Risk:** LOW–MEDIUM — fewer producers than Phase 3.

---

## Phase 5 — Multi-Tenant Fairness & Per-Provider Rate Limits

**Goal:** Prevent one workspace from monopolizing capacity.

1. Per-workspace rate-limit keys in Redis for `chat-outbound-bulk` and `bot-response`.
2. Per-AI-provider token buckets (`OpenAI`, `Anthropic`, `Google`, `DeepSeek`) keyed by API key with RPM/TPM caps.
3. Per-target-host rate limiter for `webhook`.
4. Hash-partitioned consumers for busiest queues, modeled on existing `SCHEDULER_BUCKET_RANGE` pattern in `apps/worker/src/sequence-scheduler/worker-producer.ts`.

**Risk:** MEDIUM — rate limits easy to mistune. Roll out per-provider one at a time.

---

## Phase 6 — Cleanup

1. Remove dead `broadcast` enum value or wire it up (`packages/worker-config/src/lib/types.ts:13`).
2. Decide on the `createProducer`/`createConsumer` factory in `packages/worker-config/src/message-queue/factory.ts`: promote as canonical or delete it (see note below on Kafka migration path).
3. Eliminate the two diverging concurrency defaults (5 vs 100).
4. Write `packages/worker-config/README.md` documenting every queue's tier, SLA, and retry policy.

**Risk:** LOW — structural/cosmetic, no behavior change.

---

## Kafka / Alternative Broker Migration Path

The codebase already has a dormant abstraction in `packages/worker-config/src/message-queue/`:
- `factory.ts` — `createProducer(config)` / `createConsumer(config)` with a `provider` switch
- `bullmq-provider.ts` — the only implemented provider today
- `types.ts` — `MessageQueueConfig` with `partitions`, `replicationFactor` fields (Kafka-style)

This abstraction is currently used only by `sequenceScheduler`. To make the migration path viable for all queues:

1. **Phase 6 decision point:** If Kafka is on the 12-month roadmap, promote `createProducer`/`createConsumer` as the canonical interface. Every queue goes through it. BullMQ stays the default provider; a Kafka provider can be added behind the `provider` switch.
2. **What the factory already supports:** `partitions`, `replicationFactor`, consumer groups, provider switching via env flag. The missing piece is a Kafka implementation of `MessageQueueProvider`.
3. **Practical migration:** With the factory as canonical, swapping BullMQ → Kafka at queue level is a config change (`provider: 'kafka'`), not a code rewrite. You can migrate queue by queue.
4. **If Kafka is not planned:** Delete the factory. Less indirection, simpler debugging. Direct BullMQ usage everywhere is fine indefinitely for Redis-backed workloads at this scale.
5. **Alternatives:** If you want Kafka-like semantics (log compaction, replay, consumer groups) without the operational overhead, consider **Redpanda** (Kafka-compatible, single binary) or **NATS JetStream** (simpler, Redis-style ops, built-in replay). Both can slot into the factory abstraction with a new provider implementation.

**Recommendation:** Keep Redis/BullMQ for now (Phases 1–5 deliver major scaling wins without changing the broker). In Phase 6, decide whether to invest in the factory abstraction based on whether multi-broker support is actually needed by then.

---

## Success Criteria

- [ ] No queue handles more than 5 unrelated job types
- [ ] Every outbound-to-third-party queue has a rate limiter
- [ ] Every queue has a DLQ; `removeOnFail` is not the only retention mechanism
- [ ] Bull Board live with Prometheus metrics exported
- [ ] Alerts fire on DLQ non-empty and per-tier queue-depth thresholds
- [ ] Every queue's tier, SLA, and retry policy documented in `packages/worker-config/README.md`
- [ ] Dead `broadcast` enum resolved
- [ ] One canonical producer/consumer pattern (factory promoted or deleted)
