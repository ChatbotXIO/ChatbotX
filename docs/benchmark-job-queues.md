# Job Queue Benchmark: Trigger.dev vs Temporal vs BullMQ

> Comparison focused on self-hosting a TypeScript/Node.js project.
> Date: 2026-04-17

---

## Performance Numbers

> **Note:** These numbers are **not directly comparable** — each system measures a different unit of work.
> Trigger.dev counts full containerized task executions (spin-up + checkpoint + teardown).
> Temporal counts workflow state transitions (lightweight in-process ops).
> BullMQ counts Redis queue operations (sub-millisecond by design).
> Raw throughput only matters if you actually need it at that scale.

| Metric | Trigger.dev | Temporal | BullMQ |
|--------|-------------|----------|--------|
| **Throughput** | ~1K–5K containerized tasks/sec | 10K–100K+ workflow ops/sec | **25K–50K+ jobs/sec** |
| **Unit of work** | Container spin-up + code exec + checkpoint | In-process state transition + DB write | Redis enqueue/dequeue |
| **Queue latency** | ~100–500ms (container overhead) | <100ms | **<1ms** |
| **P99 latency** | variable | predictable | <1ms |
| **Concurrent tasks** | 10K+ tasks | **1M+ workflows** | memory-limited |
| **Optimized for** | Long-running tasks (secs → hours) | High-frequency short workflow steps | Sub-second, high-volume jobs |

### Why "slower throughput" doesn't mean worse

At 1,000 tasks/sec with a 30-second average task duration, Trigger.dev handles **30,000 concurrent tasks running simultaneously** — more than most systems ever need. Its lower throughput number reflects heavier-per-unit work (container isolation, checkpointing), not inefficiency.

---

## Self-Hosting Complexity

| | Trigger.dev | Temporal | BullMQ |
|-|-------------|----------|--------|
| **Infra needed** | PostgreSQL + Redis + Docker | Cassandra/PG + Elasticsearch + multiple services | **Redis only** |
| **Setup time** | ~5 min (Docker Compose) | 30–60+ min | **<1 min** |
| **Baseline memory** | ~1–2 GB | ~4–8 GB | **<500 MB** |
| **Est. AWS cost** | $500–2K/mo | $2K–5K/mo | **$100–300/mo** |
| **DevOps burden** | Low | **High** | Very low |

---

## Durability Guarantees

| | Trigger.dev | Temporal | BullMQ |
|-|-------------|----------|--------|
| **Execution model** | Checkpoint/resume (snapshot at wait points) | **Event sourcing + deterministic replay** | At-least-once (Redis AOF) |
| **Failure recovery** | Resumes from last checkpoint | Replays full workflow history | Job re-enqueued on crash |
| **Idempotency** | Native (idempotency keys) | **Native (deterministic)** | Manual |
| **Data loss window** | Very low (DB-backed) | Very low (immutable event log) | ~1s (AOF) or minutes (RDB) |

---

## TypeScript Developer Experience

| | Trigger.dev | Temporal | BullMQ |
|-|-------------|----------|--------|
| **Learning curve** | **Shallow** | Steep (determinism constraints, Workflow/Activity split) | Very shallow |
| **Observability** | **Built-in dashboard + live logs** | DIY (Grafana/Datadog) | DIY |
| **Determinism constraints** | None | Strict — no `Date.now()`, `Math.random()`, direct I/O in Workflows | None |
| **AI/streaming support** | **Yes (first-class)** | No | No |

---

## Use Case Fit

| Use Case | Best Pick |
|----------|-----------|
| Simple background jobs (email, webhooks, notifications) | **BullMQ** — lowest latency, trivial setup |
| High-throughput batch processing | **BullMQ** — 50K+ jobs/sec |
| Long-running AI pipelines, LLM orchestration | **Trigger.dev** — streaming, no-timeout, checkpoint/resume |
| Complex multi-step workflows with compensation (saga pattern, payments) | **Temporal** — deterministic replay = strongest guarantees |
| Video/file processing pipelines | **Trigger.dev** — container isolation, real-time progress |
| Financial transactions, compliance-grade durability | **Temporal** |
| Small team, minimal infra, just needs to work | **BullMQ** (simple) or **Trigger.dev** (complex) |

---

## Decision Tree

```
Simple jobs (fire-and-forget, low latency)?
  → BullMQ

AI/streaming/long-running tasks (TypeScript)?
  → Trigger.dev

Complex orchestration, sagas, cross-service workflows?
  → Temporal

Small team, minimal infra, just need it to work?
  → BullMQ (if simple) or Trigger.dev (if complex)
```

---

## Resource Usage at Scale

| Resource | Trigger.dev | Temporal | BullMQ |
|----------|-------------|----------|--------|
| **Memory (baseline)** | ~1–2 GB | ~4–8 GB per component | **<500 MB** |
| **CPU (idle)** | 0.5–1 core | 2–4 cores | <0.1 core |
| **Storage per 1M jobs** | ~10–50 GB (PostgreSQL) | ~100–200 GB (PG + ES indexes) | ~2–5 GB (Redis, in-memory) |
| **Memory with 1M delayed jobs** | ~50–100 GB (DB-backed) | Similar (event history) | **~10 GB** (memory ceiling) |
| **Scaling bottleneck** | PostgreSQL write throughput | Persistence layer (DB/ES) | Redis single-thread + memory |

---

## Pricing (Self-Hosted)

All three are **free to self-host**:

| | Trigger.dev | Temporal | BullMQ |
|-|-------------|----------|--------|
| **License** | Apache 2.0 | MIT | MIT |
| **Cloud free tier** | $5/mo credit (~5K runs/mo) | Dev tier (not prod-ready) | N/A |
| **Cloud paid** | Pay-per-compute model | ~$200/mo (1M actions) | BullMQ Pro: $95/mo |

---

## Migration Effort

| From → To | Effort | Notes |
|-----------|--------|-------|
| BullMQ → Trigger.dev | Medium | Add checkpoint/resume logic, rewrite queuing |
| BullMQ → Temporal | High | Redesign as Workflows/Activities, determinism constraints |
| Trigger.dev → Temporal | High | Convert tasks to workflows, add Activity layer |
| Temporal → Trigger.dev | Medium | Simplify workflow logic, remove determinism constraints |

---

## Recommendation for aha.chat

Given a TypeScript chat platform with messaging integrations (Messenger, Zalo, Google Sheets):

| Use Case | Recommendation |
|----------|----------------|
| Message delivery queues | **BullMQ** — simple, fast, low overhead |
| Integration sync jobs | **BullMQ** (simple) or **Trigger.dev** (complex/long-running) |
| AI-powered features | **Trigger.dev** — streaming, checkpoint/resume, no timeout |
| Complex multi-step automations | **Trigger.dev** or **Temporal** depending on durability needs |

Most chat platforms start with **BullMQ** for simplicity, then graduate to **Trigger.dev** when jobs become complex or long-running.
