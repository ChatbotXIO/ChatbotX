# Observability

ChatbotX exposes Prometheus metrics, reports exceptions to any Sentry-compatible endpoint, and ships an optional monitoring stack. All integrations are opt-in: an OSS deployment with no observability environment variables opens no metrics port and sends no telemetry.

## Configuration

| Variable | Service | Effect |
| --- | --- | --- |
| `METRICS_PORT` | worker/realtime | Enables a local unauthenticated `GET /metrics` endpoint. The worker image treats this as the base port and assigns one consecutive port to each worker process. |
| `METRICS_TOKEN` | builder | Required bearer token for `GET /api/metrics`. Without it, the route returns `503`. |
| `SENTRY_DSN` | builder/worker/realtime | Enables Sentry SDK reporting. A GlitchTip project DSN is compatible. |
| `RELEASE_SHA` | builder/worker/realtime | Release identifier attached to Sentry events. |
| `APP_ENV` | builder/worker/realtime | Environment attached to Sentry events. |
| `UPTIME_KUMA_PUSH_URL` | schedule worker | Optional Uptime Kuma push-monitor URL pinged every minute. |
| `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` | Grafana | Provisioned Telegram contact point. |
| `ALERT_DISCORD_WEBHOOK_URL` | Grafana | Provisioned Discord contact point. |
| `BULL_BOARD_URL` | worker/Prometheus/Grafana | Base URL of the super-admin Bull Board, used for failed-queue alert links and worker-error event links. Example: `https://app.example.com/developer/queues`. |


The builder metrics route accepts only `Authorization: Bearer <METRICS_TOKEN>`. Keep this token out of browser code and create `ops/observability/secrets/metrics-token` containing the same value before starting the sample Prometheus container.

## Local stack

```bash
mkdir -p ops/observability/secrets
printf '%s' "$METRICS_TOKEN" > ops/observability/secrets/metrics-token
BULL_BOARD_URL="http://localhost:3123/developer/queues" \
GLITCHTIP_SECRET_KEY="$(openssl rand -hex 32)" \
  docker compose -f ops/observability/docker-compose.observability.yml up -d
```

Prometheus is available at `:9090`, Grafana at `:3001`, GlitchTip at `:8000`, and Uptime Kuma at `:3002`. The sample target configuration uses `host.docker.internal`; replace it with deployment DNS names in Linux and clustered deployments.

The worker image starts every worker entrypoint in one container. With `METRICS_PORT=9464`, it assigns ports `9464` upward in `all_worker_names` order. Prometheus must scrape every listed target because counters are process-local. The checked-in sample lists the current fourteen worker processes; update it with the entrypoint if a worker is added or removed.

Grafana provisions the Prometheus data source, dashboard, alert rules, Telegram contact point, and Discord contact point. Critical alerts route to both contact points with a ten-minute repeat interval and resolved notifications. The sample Prometheus container expands `BULL_BOARD_URL` into `global.external_labels.bullboard_url`, so `ops/observability/prometheus/alerts.yml` emits the same links for deployments that prefer Alertmanager.

## Metrics

- `chatbotx_messages_total{direction,channel}` — a newly persisted inbound or outbound message. Labels deliberately exclude workspace and contact identifiers.
- `chatbotx_jobs_completed_total{queue,job}` and `chatbotx_jobs_failed_total{queue,job,error_class}` — BullMQ outcomes. `error_class` is one of `code_bug`, `db_transient`, `third_party`, or `unknown`.
- `chatbotx_queue_waiting`, `chatbotx_queue_oldest_waiting_seconds`, and `chatbotx_queue_failed` — scrape-time queue state for messaging and scheduling queues.
- `chatbotx_side_effect_failed_total{name="mac_claim"}` — MAC tracking failed after the primary contact transaction committed.
- `chatbotx_*` Node runtime metrics — default `prom-client` metrics including event-loop lag and heap usage.

Sentry events redact secret-named fields and request bodies before send. Worker failure events include queue, job, job ID, error classification, retry-attempt tags, and a Bull Board job link when `BULL_BOARD_URL` is configured. Identical queue/job/class/message events are deduplicated for one minute in-process.

## Alert runbook

### `MessagingCodeBug`

A deterministic code or SQL failure occurred in an integration, chat, or webhook job. Open the matching GlitchTip issue, confirm `RELEASE_SHA`, stop rollout if the release is new, then open Bull Board’s **Failed** tab for the alerted queue. Inspect the job data and stack trace; after the fix is deployed, select **Retry all**. Bull Board is the replay and investigation tool, not the alert source: it retains only 5,000 failed jobs per queue and does not cover builder-side message creation or historical failure rates. It does not alert on completed-but-unsaved jobs; inspect their `{ "skipped": "<reason>" }` result in the **Completed** tab. The volume-drop alert may reveal aggregate or systemic loss, and the webchat canary covers only its configured webchat path; neither detects an isolated skipped replay.

### `WorkerJobFailureRate`

Check failures grouped by `queue` and `error_class`. `db_transient` requires PostgreSQL/Redis capacity and lock inspection; `third_party` requires provider status and credentials; `unknown` requires the error stack in GlitchTip.

### `InboundMessageVolumeDrop`

Validate the comparison window is meaningful for the deployment, then check webhook ingress, channel provider status, integration queue depth, and worker heartbeat. This detects silent failures that do not throw.

### `MessagingQueueBacklog`

Check Redis, worker process health, and the job class at the head of the affected queue. Do not scale workers before identifying an exhausted downstream provider or database lock.

### `WorkerDown`

A worker metrics process cannot be scraped. Check the container supervisor and all consecutive `METRICS_PORT` bindings. Uptime Kuma should independently page if the worker heartbeat stops.

### `MacClaimSideEffectFailed`

Messaging remains available because MAC tracking runs in a savepoint after contact creation. Inspect the Sentry event, repair the analytics/database failure, then use the regular message event MAC tracking and quota reconciliation to restore the durable rollup. Temporary under-counting intentionally fails quota enforcement open; losing a customer message is worse.

## Canary after deploy

`ops/observability/canary-webchat.mjs` is an executable public-webchat probe. It posts a unique release marker to `/api/guest/messages`, polls the same authenticated conversation, and succeeds only after both the persisted marker and `CANARY_EXPECTED_FLOW_TEXT` appear within `CANARY_TIMEOUT_MS` (60 seconds by default).

Provision a dedicated webchat conversation first, set its durable server-side contact id as `CANARY_CONTACT_ID`, and keep it out of normal user journeys. `MacTrackingService` excludes only that configured contact id from monthly active-contact accounting; a browser cannot forge the exclusion. Run the probe in the post-deploy job or from an Uptime Kuma Script monitor with these deployment secrets: `CANARY_BUILDER_URL`, `CANARY_WEBCHAT_WORKSPACE_ID`, `CANARY_WEBCHAT_ID`, `CANARY_WEBCHAT_ACCESS_TOKEN`, `CANARY_WEBCHAT_ORIGIN`, `CANARY_GUEST_CONVERSATION_ID`, `CANARY_EXPECTED_FLOW_TEXT`, and `RELEASE_SHA`.

```bash
node ops/observability/canary-webchat.mjs
```

The probe exits nonzero on a failed send, read, persistence check, or flow response check so the deployment monitor can alert with the release SHA.
