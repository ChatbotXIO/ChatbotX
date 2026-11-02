# Existing Workers

| Worker | Queue | Entry |
|--------|-------|-------|
| integration | `integration` | `src/integration/worker.ts` |
| chat | `chat` | `src/chat/worker.ts` |
| ai-agent | `aiAgent` | `src/ai-agent/worker.ts` |
| heavy | `heavy` | `src/heavy/worker.ts` |
| default | `default` | `src/default/worker.ts` |
| trigger | `trigger` | `src/trigger/worker.ts` |
| webhook | `webhook` | `src/webhook/worker.ts` |
| schedule | (cron) | `src/schedule/worker.ts` |
| sequence-scheduler | `sequenceScheduler` | `src/sequence-scheduler/worker*.ts` |
| notification | `notification` | `src/notification/worker.ts` |
| low | `low` | `src/low/worker.ts` |
| marketing-message | `marketingMessage` | `src/marketing-message/worker.ts` |
| events | event-bus (not BullMQ) | `src/events/worker.ts` — `startWorker([...listeners])` from `@chatbotx.io/event-bus/worker` |

`queueNames` (`packages/worker-config/src/lib/types.ts:3`) also declares `broadcast` and
`quota`, which have queues but no dedicated worker entry — their jobs are consumed by the
workers above. Some queues get their own `Worker` (own concurrency) hosted inside an existing
process: `profileSnapshot` and `leaderboard` in `src/low/worker.ts`. Marketing Messages
campaign steps have their own `marketingMessage` worker, while schedule crons enqueue them.
Check `apps/worker/tsdown.config.ts` for the authoritative entry list.

The `heavy` queue/worker is a **workload-class** queue, not a domain queue:
use it for bounded but RAM/CPU/I/O/model-heavy jobs that should not occupy
latency-sensitive domain workers. AI file processing, media generation,
speech/text conversion, document extraction, and image analysis are current
tenants. Future heavy workloads can join this queue with their own
`src/heavy/handlers/<domain-or-capability>/` handler area when the same
resource-isolation tradeoff applies.
