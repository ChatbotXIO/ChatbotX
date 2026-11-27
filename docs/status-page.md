# Public status page

ChatbotX publishes a customer-facing status page on a hosted service (Better Stack), so it stays up when ChatbotX is down. It is separate from the internal monitoring in [observability.md](observability.md): the internal stack shows every metric and pages the team; the status page shows only the components customers know.

History starts on the monitoring start date. Days before it are not shown as 100% uptime.

## Components and signals

| Group | Component | Signal | Status update |
| --- | --- | --- | --- |
| Platform | Core infrastructure | HTTP monitor on `GET <builder>/api/health/ready` | Automatic |
| Realtime | Realtime | HTTP monitor on `GET <realtime>/ready` | Automatic |
| Worker | Background scheduler | Heartbeat monitor fed by the `statusHeartbeat` schedule job | Automatic |
| Product operations | Dashboard, Public API, Automations and broadcasts | Confirmed customer impact; relevant internal alerts | Manual |
| Channels | Messenger, Instagram, WhatsApp, Telegram, Zalo, TikTok, LINE, Webchat, Email | Confirmed customer impact; relevant internal alerts | Manual |
| AI | AI Agent | Confirmed customer impact; relevant internal alerts | Manual |

Each component description on the page must state what its check covers. Do not publish separate automatic Dashboard, Public API, Automations or Broadcasts components until checks cover those operations (see [Deferred automatic components](#deferred-automatic-components)).

A manual component means the team updates it after confirming impact. It does not mean an automatic check covers it.

### What each automatic signal covers

- **Core infrastructure** — `/api/health/ready` runs `SELECT 1` on the main database and `PING` on cache Redis (`REDIS_CACHE_URL`, else `REDIS_URL`), in parallel, each on a dedicated short-lived probe connection with a 2-second total budget. It returns `200 {"db":true,"redis":true}`, or `503` with the two booleans. It does **not** test page rendering, authentication, the public API, message shards, or queue Redis. `/api/health` stays a dependency-free liveness check for the Docker health check.
- **Realtime** — `/ready` reports the gateway's readiness flag. It does **not** prove end-to-end WebSocket delivery.
- **Background scheduler** — the `statusHeartbeat` job runs on the `schedule` queue once a minute (second 54) and sends `GET STATUS_HEARTBEAT_WORKER_URL`. It proves the schedule queue (bulk queue Redis: `REDIS_QUEUE_BULK_URL`, else `REDIS_QUEUE_URL`, else `REDIS_URL`) can execute a job. It does **not** prove that chat, trigger, broadcast, or AI consumers work.

Cache, queue, and bulk queue Redis can be different servers. Record the deployed topology below so it is clear which Redis each signal checks.

## Coverage table

Complete this table before release. PR #1560's alerts are aggregate: none is per channel and none is specific to AI. Where no suitable alert exists, detection is manual (support reports and operator checks).

| Component | Alert or canary | Where it runs | Primary owner | Backup owner | Known gaps |
| --- | --- | --- | --- | --- | --- |
| Core infrastructure | Better Stack HTTP monitor → `/api/health/ready` | Better Stack | _TBD_ | _TBD_ | No auth, page, public API, message-shard or queue-Redis coverage |
| Realtime | Better Stack HTTP monitor → `/ready` | Better Stack | _TBD_ | _TBD_ | No end-to-end WebSocket delivery check |
| Background scheduler | Better Stack heartbeat ← `statusHeartbeat` | Better Stack + schedule worker | _TBD_ | _TBD_ | Other consumers can stop while the scheduler stays green |
| Dashboard / Public API | None automatic; support reports | — | _TBD_ | _TBD_ | Needs a browser check and an authenticated public-API read |
| Automations and broadcasts | `WorkerJobFailureRate` (all instrumented queues, incl. `trigger`, `schedule`) | Grafana | _TBD_ | _TBD_ | Failure rate only; no delivery check |
| Channels (all) | `InboundMessageVolumeDrop`, `MessagingQueueBacklog` (`integration`, `chat`), `MessagingCodeBug` (`integration`, `chat`, `webhook`) | Grafana | _TBD_ | _TBD_ | Aggregate across channels — cannot name the affected channel |
| Webchat | `ops/observability/canary-webchat.mjs` | Post-deploy job / script monitor | _TBD_ | _TBD_ | Covers only the configured webchat path |
| AI Agent | `WorkerJobFailureRate{queue="aiAgent"}` (instrumented through `createQueueWorker`) | Grafana | _TBD_ | _TBD_ | Queue failure rate only — no AI-provider or answer-quality alert; verify the worker process is scraped |

## Better Stack configuration

These steps are done in the Better Stack dashboard; no code change.

1. HTTP monitor for `https://<builder>/api/health/ready`, 1-minute interval.
2. HTTP monitor for `https://<realtime>/ready`, 1-minute interval.
3. Heartbeat monitor for the worker: period 1 minute, grace 3 minutes.
4. Put the heartbeat URL into `STATUS_HEARTBEAT_WORKER_URL` in production. Use a different URL for test environments; every schedule worker replica in one deployment uses the same value. See the rollout in [observability.md](observability.md#worker-heartbeat-rollout).
5. Create the status page with the groups and components above; connect the automatic components to their monitors.
6. Custom domain (for example `status.chatbotx.io`) with its DNS CNAME. Keep the hosted provider URL as a fallback.
7. Enable email subscriptions; verify confirmation and delivery with a test subscriber.
8. Show 90 days of history; record the monitoring start date.
9. HTTP monitors: target 2 minutes of continuous failure before public downtime and 2 consecutive successful checks before recovery. Record the actual Better Stack settings. If the service cannot express this, keep the component manual until an equivalent policy is agreed.
10. Heartbeat: measure and record the real detection delay with the 1-minute period and 3-minute grace. Do not quote the grace period alone as the detection time.
11. Verify a manual incident keeps a product component degraded after an automatic probe recovers; a probe recovery must not close it.
12. Configure planned maintenance to suppress false outage notifications for the affected monitors; verify the public maintenance state and internal alert handling.
13. Verify the page and operator access work while ChatbotX is unavailable.
14. Verify the Better Stack plan supports the monitors, custom domain, and subscriptions. Record its cost and account owner.

### Recorded settings

Fill in before production launch.

| Item | Value |
| --- | --- |
| Monitoring start date | _TBD_ |
| HTTP failure / recovery thresholds (actual) | _TBD_ |
| Measured heartbeat detection delay | _TBD_ |
| Subscriber delivery test result | _TBD_ |
| Better Stack plan, cost, account owner | _TBD_ |

## Builder link

Set `NEXT_PUBLIC_STATUS_PAGE_URL` to show a **System status** item in the builder's help menu. Unset hides it; self-hosted operators can point it at their own page. The builder injects this variable into the page at request time (`PublicEnvScript`), so changing it needs a restart, not a rebuild.

## Incident procedure

1. An internal alert, an external monitor, or a support report reaches the team.
2. The primary on-call engineer checks customer impact. If the primary does not acknowledge within 5 minutes, escalate to the backup. Both owners and their contact routes are in the coverage table.
3. Within 10 minutes of confirming customer impact, open an **Investigating** incident. State the affected operations and the known scope. Do not wait for the root cause. Name a provider (Meta, WhatsApp, …) as the cause only after verification.
4. Update the incident at least every 30 minutes.
5. After the repair, verify the affected customer operation and the backlog recovery, then move to **Monitoring**. Close the incident after at least 10 minutes of stable operation. A green readiness probe alone is not enough.
6. For a large incident, write a postmortem.

A stopped chat or trigger consumer does not turn the Background scheduler red. Use this manual procedure for product incidents the automatic signals do not cover.

## Maintenance procedure

Announce planned maintenance at least 48 hours before it starts. For emergency maintenance, notify as soon as possible and state why advance notice was not possible.

## Deferred automatic components

- **Dashboard and Public API** need a browser check of a representative dashboard operation and an authenticated public-API read, using an isolated test workspace and a token with minimum scopes.
- **Automations and Broadcasts** need evidence from their processing and delivery paths. A second copy of the readiness monitor is not that evidence.

## API surface (invariant 23)

This feature adds no workspace capability, so it ships no public oRPC procedure: the help link is UI-only plumbing, monitor configuration is platform administration, and `/api/health/ready` is an unauthenticated platform infrastructure probe, not a workspace operation.
