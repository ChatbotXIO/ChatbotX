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
process: `profileSnapshot`, `leaderboard`, `contactInfoCapture` and `postPublish` (composed-post publishing) in `src/low/worker.ts`, and `template` (template
install, sync, uninstall and fan-out) in `src/default/worker.ts`. Marketing Messages
campaign steps have their own `marketingMessage` worker, while schedule crons enqueue them.
Check `apps/worker/tsdown.config.ts` for the authoritative entry list.

The `low` queue is a workload-class queue too: besides media and replay backfill it hosts the
bookkeeping ingress that `enqueueIntegrationJob` routes off `integration` (`messageStatus`
without a flow branch, `contactMarkAsRead`, `incomingMessageEcho`), so a new "nobody waits
on this" webhook action is added to `isLowRoutedIntegrationJob` and `LowRoutedIntegrationJob`
(`packages/worker-config/src/queues/integration/index.ts`), not given a queue of its own.
Producers of bulk work on `low` set `priority: LOW_BULK_PRIORITY` so that ingress passes them.

`reconnectPublishFanOut` (`LowJobAction`, handler `processReconnectPublishFanOut` in `src/publish-destination/reconnect-fan-out.ts`) is a `low` job: when one Facebook Page reconnect cannot refresh every other Messenger and Instagram-via-Facebook inbox of the same person inline (100 pages / 20 s), the rest continues here. The payload carries the page tokens encrypted (never plaintext in Redis), the work is idempotent and guarded like the inline run (same workspace, same app client id, same stored authorizer, connected inbox only, never creates one), the job id dedups per workspace and Facebook user, and a job that runs out of its 5 minute budget enqueues the next hop, at most 10 (`docs/posts.md`, "Reconnect fan-out").

`refreshPublishDestinationAvatar` (`LowJobAction`, handler `refreshPublishDestinationAvatar` in `src/publish-destination/refresh-avatar.ts`) is a `low` job: fetches one inbox publish destination's Page/profile picture with the destination's own token (loaded in the worker, never in the payload), re-hosts it under `public/space/<workspaceId>/publish-destinations/<id>/` and stores the path in `PublishDestination.avatar`. Enqueued after a connect/reconnect (`captureInboxScopes`, delayed 10 s) and by the destinations list backfill (never fetched or older than 7 days, at most 20 per call); jobId `refresh-publish-destination-avatar-<id>` dedups. A failure back-dates `avatarFetchedAt` so the retry comes after a day; the job never throws for a network problem.

The `heavy` queue/worker is a **workload-class** queue, not a domain queue:
use it for bounded but RAM/CPU/I/O/model-heavy jobs that should not occupy
latency-sensitive domain workers. AI file processing, media generation,
speech/text conversion, document extraction, and image analysis are current
tenants. Future heavy workloads can join this queue with their own
`src/heavy/handlers/<domain-or-capability>/` handler area when the same
resource-isolation tradeoff applies.
