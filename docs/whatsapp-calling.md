# WhatsApp Business Calling

ChatbotX supports Meta's WhatsApp Business Calling API end to end: call
logging, calling settings, call-permission management, a "Call on WhatsApp"
flow step, and (beta) in-app calling over a self-hosted **FreeSWITCH** SIP
stack, with recording and transcription.

FreeSWITCH replaces the earlier LiveKit-based transport. This document
describes the shipped implementation.

## Feature map

| Capability | Where | Requires |
|---|---|---|
| Call log + inbox activity messages | automatic once the `calls` webhook field is subscribed | Meta app subscribed to `calls` |
| Calls settings (enable, icon, callback permission) | Settings → WhatsApp → Calls | connected number |
| Call permission requests + grant tracking | inbox composer 📞 button | calling enabled |
| "Call on WhatsApp" flow step (`voice_call` interactive) | flow builder → Send Message (WhatsApp) | calling enabled |
| Call triggers (`incomingCall`, `missedAudioCall`, `callEnded`, `callRecorded`, `callTranscribed`) | Triggers / Webhooks | — |
| System fields `{{last_call_recorded}}`, `{{last_call_transcript}}` | flows/broadcasts | recording/transcription |
| In-app calling (answer in browser), recording, transcription | inbox call dock | FreeSWITCH deployment (below) |

## 1. Overview and architecture

```
WhatsApp user ⇄ Meta SIP (wa.meta.vc, TLS :5061, SDES-SRTP, Opus)
                     ⇅
             FreeSWITCH profile "whatsapp"  (Meta-facing, TLS-only, no client-cert request)
                     ⇅ bridge (parallel fork to registered agents)
             FreeSWITCH profile "agents"    (WSS :7443, DTLS-SRTP via browser, ICE via coturn)
                     ⇅
             Agent browser (SIP.js SimpleUser)

FreeSWITCH ──ESL :8021 (loopback/ACL)──▶ apps/worker "freeswitch" process (leader-elected)
                                              │
                                              ├─▶ BullMQ "integration" queue → DB rows, realtime events
                                              ├─▶ BullMQ "freeswitch:<nodeId>" queue  (sync ESL API RPC)
                                              └─▶ BullMQ "freeswitch-recordings:<nodeId>" queue (upload)

FreeSWITCH ──mod_xml_curl (HTTPS + Basic auth + IP allowlist)──▶
    apps/builder POST /api/freeswitch/xml   (renders configuration/directory/dialplan XML)

FreeSWITCH record_session ──▶ local RECORDINGS_DIR volume ──▶ worker uploads to S3 (private key)
```

Every FreeSWITCH node is a **complete, independent stack**: its own hostname,
TLS cert, `whatsapp` + `agents` sofia profiles, coturn instance, recordings
volume, and a co-located `freeswitch` worker process. Horizontal scale is
**sharding by workspace**, never a shared registrar or load-balanced pool —
Meta allows only one SIP `servers[]` hostname per business number, so a
number is always pinned to exactly one node (`packages/business/src/
whatsapp-call/sip-node-allocator.ts`, `WorkspaceSipNode` table).

Pinned versions: FreeSWITCH **1.11.3** (`docker/freeswitch/Dockerfile`,
build arg `FREESWITCH_VERSION`), `coturn/coturn` image tag
**`4.18.0-alpine`** (`docker-compose.yml`).

## 2. Prerequisites

### Meta

1. The WhatsApp number must be on the **Cloud API** platform
   (`platform_type: CLOUD_API`) — on-premise numbers cannot use calling.
2. Messaging limit ≥ **2,000** unique customers/24h (Meta tiers below this —
   `TIER_50`, `TIER_250`, `TIER_1K` — are rejected by the preflight check in
   `apps/builder/src/features/integration-whatsapp/calling/
   get-whatsapp-calling-preflight.ts`).
3. The Meta **app** (not just the WABA) must be subscribed to the
   **`calls`** webhook field, alongside `messages`
   (App Dashboard → WhatsApp → Configuration, or via
   `fixWhatsappCallsSubscriptionAction` → `integrations/whatsapp/src/api/
   app-subscriptions.ts::ensureAppWebhookFields`, which unions in missing
   required fields on the app's *existing* callback URL — it never invents
   one). See Meta's [WhatsApp Business Calling API docs](https://developers.facebook.com/docs/whatsapp/cloud-api/calling)
   and [webhooks reference](https://developers.facebook.com/docs/graph-api/webhooks).
4. Business-initiated calling is unavailable in some countries (Vietnam
   among them — the outbound action heuristically blocks destination
   numbers starting with `84`) and is billed by Meta per minute in
   6-second increments; customer-initiated calls are free.
5. A **SignalWire** free registration token to install FreeSWITCH packages
   from SignalWire's apt repository at image build time
   (`docker/freeswitch/Dockerfile`, build arg or BuildKit secret
   `SIGNALWIRE_TOKEN` — build-time only, never read at runtime, never
   logged; sign up at signalwire.com).
6. A public DNS **A** record and a valid TLS certificate for the SIP/WSS
   hostname (`FS_SIP_DOMAIN`) — Meta requires TLS on :5061 and does **not**
   support mutual TLS (see §5 Security).
7. Firewall access: :5061/TCP inbound from Meta's IP ranges, :7443/TCP from
   agent browsers, :8021 never exposed off the host (ESL is loopback-only
   in production), plus the RTP UDP range and coturn's ports (§4).

## 3. Local development

The compose stack starts the `freeswitch` service by **default**;
`coturn` only runs under the `production` compose profile — Meta's SIP leg
cannot reach a laptop, so local dev exercises the container test harness
below rather than a real Meta number, and agent-to-agent WebRTC in dev
falls back to host ICE candidates without a TURN relay.

### Environment variables (`.env.example`)

| Variable | Local default | Purpose |
|---|---|---|
| `FS_SIP_DOMAIN` | `fs.localhost` | Public SIP/WSS hostname (and coturn `realm`) |
| `FS_PUBLIC_IP` | `127.0.0.1` | Advertised in SDP/Via (`external_sip_ip`/`external_rtp_ip`) |
| `FS_ESL_PASSWORD` | `devcluecon` | ESL (port 8021) password — grants full call control |
| `FS_XML_BASIC_USER` / `FS_XML_BASIC_PASS` | `fsxml` / `devsecret` | Basic auth FreeSWITCH presents to the xml_curl responder |
| `FS_XML_ALLOWED_IPS` | `127.0.0.1` | Comma-separated allowlist for the xml_curl responder (defense in depth — see §5) |
| `CBX_XML_URL` | `http://host.docker.internal:3123/api/freeswitch/xml` | Where mod_xml_curl POSTs |
| `FS_NODES` | `{"default":{"sipDomain":"fs.localhost","wssUrl":"wss://fs.localhost:7443","turnUrl":"turn:fs.localhost:3478"}}` | JSON map of nodes for sharding by workspace |
| `FS_NODE_ID` | `default` | Which entry of `FS_NODES` this worker/FreeSWITCH instance is |
| `FS_MAX_RING_TARGETS` | `8` | Max agents rung per inbound call |
| `CALL_TRANSCRIBE_PER_MIN` | `10` | BullMQ limiter for the transcription queue |
| `RECORDINGS_DIR` | `/recordings` | Local path `record_session` writes `.ogg` files to, shared with the worker via the `recordings` volume |
| `TURN_STATIC_SECRET` / `TURN_URL` | unset | coturn shared secret + URL; production only |
| `SIGNALWIRE_TOKEN` | unset | Build-time only, FreeSWITCH package install |

Leaving `FS_SIP_DOMAIN` unset hides the beta calling UI entirely.

### Running it

```bash
docker compose up -d          # starts freeswitch (default profile) + shared infra
pnpm --filter worker worker:freeswitch   # runs apps/worker/src/freeswitch/worker.ts
```

`worker:freeswitch` is `dotenv -e ../../.env -- tsx --watch src/freeswitch/worker.ts`
(`apps/worker/package.json`). It connects to FreeSWITCH's ESL port, wins a
per-node leader lock, subscribes to the relevant events, and starts the two
per-node BullMQ consumers described in §6.

### Container integration test

`apps/worker/__tests__/freeswitch-container.test.ts` builds the pinned
FreeSWITCH image, boots it with a stub xml_curl server, and drives it with
`sipp` and a raw ESL client. It is skipped unless explicitly enabled:

```bash
RUN_FS_CONTAINER=1 SIGNALWIRE_TOKEN=<token> pnpm --filter worker test -- freeswitch-container
```

It asserts, among other things: both sofia profiles come up `RUNNING`/TLS;
a gateway added via the xml_curl `configuration` binding appears and
disappears across `sofia profile whatsapp rescan`; an inbound TLS INVITE
via `sipp` reaches the `whatsapp_inbound` context and emits a `cbx::call`
event carrying the correlation variables (including the literal
`x-wa-meta-wacid` header, lower-cased by FreeSWITCH's channel-variable
convention); an outbound bridge produces exactly one wire INVITE over TLS
with SDES crypto and Opus-first SDP and **no re-INVITE** over 120s;
`record_session` writes a 16 kHz stereo `.ogg`; a 200-call/30-per-second
load run produces no "Lost events"; and a two-node sharding run proves node
A never sees node B's gateway or agents.

**The test's own header comment states it has not been run end-to-end** —
`docker build` / `docker manifest inspect` require network access the test
author's environment did not have. Treat it as unverified until it has
actually been run once against the pinned image.

## 4. Production deployment

- The production stack is deployed from the separate deployment repo
  (Docker Swarm), not from this repo's `docker-compose.yml`, which is
  local-dev only. Requirements that stack must satisfy: FreeSWITCH and
  coturn run with host networking, because SIP/RTP/TURN need real source
  IPs and a wide UDP port range that container NAT would otherwise have to
  publish port-by-port.
- Ports: `5061/tcp` (Meta SIP TLS, restricted to Meta's IP ranges — see
  §6 ACL refresh), `7443/tcp` (agent WSS, open), `8021/tcp` (ESL — **never**
  exposed on the host firewall; loopback-only, `FS_ESL_LISTEN_IP=127.0.0.1`
  in prod), `16384-32768/udp` (RTP; the local compose default is a much
  narrower `50700-50720/udp`), plus coturn's `3478/udp+tcp`,
  `5349/tcp+udp` (TLS) and its relay range.
- coturn only runs in production (locally it sits behind the `production`
  compose profile and is never started); local dev relies on host ICE
  candidates instead of a TURN relay.
- Per-node env: `FS_NODE_ID` selects which entry of `FS_NODES` this
  FreeSWITCH/worker pair is; `FS_NODES` is a JSON map
  `{ "<nodeId>": { sipDomain, wssUrl, turnUrl } }`. Adding a node is a
  config change plus new workspaces landing on it — moving an existing
  workspace is a manual runbook (deprovision → repin → provision), not
  automatic.
- **Sharding by workspace**: `WorkspaceSipNode` (one row per workspace,
  `workspaceId` primary key) pins a workspace to a node the first time its
  WhatsApp number is provisioned, via `pinWorkspaceToNode` /
  `chooseLeastLoadedNode` (`packages/business/src/whatsapp-call/
  sip-node-allocator.ts`), guarded by a distributed lock
  (`freeswitch-node-alloc`) plus a DB `ON CONFLICT (workspaceId) DO NOTHING`
  for same-workspace races. `IntegrationWhatsapp.sipNodeId` is a
  denormalized copy of that pin, read by the responder, the settings
  action, and the softphone-credentials action.
- Certificate renewal: the renewal hook must copy the new cert into
  FreeSWITCH's `tls-cert-dir` (`/etc/freeswitch/certs`, referenced by both
  sip profiles) and coturn's cert mount (`/etc/coturn/certs`, same
  `wss.pem`/`wss.key` files), then restart (not `rescan`) the `whatsapp`
  and `agents` sofia profiles off-hours — ACL and TLS changes require a
  profile **restart**; `rescan`/`reloadxml` only re-reads xml_curl-backed
  dialplan/directory/configuration sections.
- coturn requires `network_mode: host` and a bind mount of the certs
  directory (`FS_CERTS_DIR`, holding `wss.pem`/`wss.key`) — the relay range
  (`min-port`/`max-port`, 16k ports) cannot be published through Docker's
  bridge network, and host networking is the only way to expose it. The
  host firewall must open `3478/udp+tcp`, `5349/udp+tcp`, and the full
  relay range as UDP.
- Meta IP ACL refresh: `scripts/update-meta-sip-acl.sh` queries
  `whois -h whois.radb.net -- '-i origin AS32934'`, collapses the routes,
  and rewrites `docker/freeswitch/conf/autoload_configs/
  meta_sip_ranges.xml` (generated file, header says do not hand-edit). The
  current committed snapshot (23 IPv4 CIDRs, dated 2026-09-11) is IPv4-only
  by design — the `whatsapp` profile only binds IPv4. Applying a refreshed
  file requires a profile **restart** of `whatsapp`, run off-hours, same as
  a cert rotation.
- Preflight before flipping DNS/going live:
  `scripts/whatsapp-sip-preflight.sh <hostname> [ports...]` (default ports
  `5061 7443 5349`) checks the DNS `A` record and runs
  `openssl s_client -verify_hostname` against each port, matching Meta's
  own recommended verification method.
- coturn's `turnserver.conf` ships with literal `CHANGE_ME_*` placeholders
  for `realm` and `static-auth-secret` — there is no templating step;
  operators must hand-edit the file (or override via the compose
  `command`, which is how the committed compose file actually injects
  `TURN_STATIC_SECRET`/`FS_SIP_DOMAIN`) before deploying.

## 5. Provisioning flow

`IntegrationWhatsapp.sipProvisioningStatus` is a state machine
(`packages/business/src/whatsapp-call/sip-provisioning-service.ts`):

```
none ──provision()──▶ provisioning ──▶ provisioned ──▶ enabled
  ▲                        │                             │
  └────────deprovision()───┴─────────────failed◀─────────┘
                                            │
                                     provisioning (retry)
```

- **`none → provisioning → provisioned`** (`provision()`): claims a 5-minute
  lease (`sipProvisioningClaim`/`sipProvisioningLeaseUntil`), pins the
  workspace to a node (§4), fetches the Meta-issued SIP digest password via
  `GET /{phone-number-id}/settings?include_sip_credentials=true`
  (`integrations/whatsapp/src/api/calling.ts::getCallingSettings`), encrypts
  it (`encryptUtils`, never hashed — FreeSWITCH digest auth needs the clear
  password at lookup time) and stores it with a `sipGatewayName =
  "wa-<integrationId>"`, runs `sofia profile whatsapp rescan` over the ESL
  API queue, and verifies the gateway now appears in `sofia status gateway
  wa-<id>` before marking `provisioned`. Any thrown error inside this
  sequence writes `sipLastError` and status `failed`, scoped to the same
  claim — a stolen or expired lease from a retry no-ops rather than
  clobbering a newer attempt.
- **`provisioned → enabled`** (`updateWhatsappCallingSettingsAction`,
  super-admin only): POSTs Meta's calling settings with `sip.status:
  ENABLED`, `sip.webhook_delivery: ENABLED`, `srtp_key_exchange_protocol:
  "SDES"`, `audio.additional_codecs: ["PCMA","PCMU"]`, and a
  `servers: [{ hostname, port: 5061 }]` entry — refuses to run unless
  status is already `provisioned` and a `sipNodeId` is set, then reads
  Meta's settings back and asserts the SIP status actually changed before
  flipping the local status.
- **`enabled → none`**: `deprovision()` first tells Meta `sip.status:
  DISABLED`, then kills the FreeSWITCH gateway (`sofia profile whatsapp
  killgw wa-<id>`), then clears the stored credential/gateway/status.
- Reading errors: `sipLastError` on `IntegrationWhatsapp` carries the most
  recent provisioning failure; the Calls settings card surfaces it inline.
  A `sofia::gateway_state` ESL event reporting `DOWN`/`FAILED`/`FAIL_WAIT`
  also writes into `sipLastError` if a provisioning claim is still present.

## 6. Call flows

### Inbound (Meta → agent)

1. Meta's INVITE hits the `whatsapp` sofia profile (TLS :5061, challenged
   with digest auth, realm = the FreeSWITCH domain).
2. The dialplan (rendered per-request by the xml_curl responder,
   `renderInboundDialplan` in `packages/business/src/whatsapp-call/
   freeswitch-xml-service.ts`) resolves the integration by destination
   digits, exports `cbx_integration_id`/`cbx_workspace_id`/`cbx_root_uuid`,
   fires a `CUSTOM cbx::call` event (`cbx_phase=inbound`), forces SDES-SRTP,
   answers (guaranteeing RTP flow toward Meta), and — if
   `callRecordingEnabled` — starts `record_session` at 16 kHz into
   `RECORDINGS_DIR/wa/<workspaceId>/<uuid>.ogg`.
3. It selects at most `FS_MAX_RING_TARGETS` agents from
   `AgentSipPresence` (assignee first, then least-recently-rung; index
   `AgentSipPresence_ring_idx`) who also hold inbox permission, and
   `bridge`s to each of them in parallel on the `agents` profile
   (`user/ag-<workspaceId>-<userId>@<domain>`). No registered agent →
   plays a "no agent" prompt and hangs up.
4. The worker's `freeswitch` process (leader-elected via
   `distributedLock.runExclusive({ key: "freeswitch-esl:<nodeId>" })`)
   receives the `cbx::call` event over ESL, resolves/creates the contact
   inbox + conversation + `WhatsappCall` row
   (`createFromFreeswitch`/`ensureCallRow`, idempotent on
   `freeswitchUuid`), and emits a `whatsappCallRinging` realtime event that
   opens the incoming-call dock in the inbox.
5. An agent's browser answers via SIP.js (`use-sip-user.ts`); the agent
   leg's `CHANNEL_ANSWER` marks the row `accepted` with
   `answeredByUserId`/`freeswitchBLegUuid`.
6. `CHANNEL_HANGUP_COMPLETE` on the Meta (A) leg finalizes the row via the
   hangup-cause map (`packages/business/src/whatsapp-call/
   hangup-cause.ts`): `NORMAL_CLEARING` after `accepted` → `completed`;
   `NO_ANSWER`/`ORIGINATOR_CANCEL`/`ALLOTTED_TIMEOUT`/`NO_USER_RESPONSE` →
   `failed` (rendered as "Missed voice call" — the status enum has no
   separate `missed` value); `CALL_REJECTED`/`USER_BUSY` → `rejected`;
   anything else → `failed` + `lastError`.
7. Meta's own `connect`/`terminate`/`status` webhooks (Cloud API `calls`
   field) keep running in parallel and reconcile on `wacid` — `connect`
   for a `userInitiated` call usually finds the row the FreeSWITCH event
   already created and just attaches the `wacid`; the BYE's
   `x-wa-meta-wacid` header fills a still-null `wacid` too.

### Outbound (agent → Meta, business-initiated)

1. `startWhatsappCallAction`: checks the integration is `enabled`, checks
   Meta call permissions (`GET /{pnid}/call_permissions?
   user_wa_id=...`/`can_perform: start_call`), refuses destination numbers
   starting with `84` (Vietnam — Meta disallows business-initiated calling
   there; a documented heuristic, not full E.164 parsing), inserts a
   `WhatsappCall` row **before** dialing (partial unique index enforces one
   pending outbound attempt per contact-inbox), and returns
   `{ attemptId, callId, dialUri: "sip:+<digits>@<node sipDomain>" }`.
2. The browser's SIP.js `SimpleUser` places the INVITE with header
   `X-CBX-Attempt: <attemptId>`.
3. The `agents` dialplan context resolves the attempt, exports
   `cbx_integration_id`/`cbx_workspace_id`/`cbx_root_uuid`/`cbx_attempt_id`,
   fires `CUSTOM cbx::call` (`cbx_phase=outbound`), and bridges through
   `sofia/gateway/wa-<id>/<destination>` toward `wa.meta.vc`.
4. The worker binds the row by `attemptId` equality
   (`attachFreeswitchUuid`), then finalizes it the same way as inbound —
   the Meta B-leg's `CHANNEL_HANGUP_COMPLETE` carries `sip_hangup_cause`/
   `sip_term_status` (mapped: `407`→auth failure, `403`→forbidden/duplicate,
   `480`/`486`→busy/unavailable) on a failed dial.
5. `hangupWhatsappCallAction` (server-initiated hangup) resolves
   `freeswitchBLegUuid ?? freeswitchUuid` and runs `uuid_kill` over the ESL
   API queue.
6. A schedule job (`sweepStaleWhatsappCalls`, every 5 minutes) fails any
   `ringing` row with no `freeswitchUuid` after 90 seconds.

## 7. Recording and transcription

- `record_session` writes OGG-Vorbis, 16 kHz, stereo, to
  `RECORDINGS_DIR/wa/<workspaceId>/<freeswitchUuid>.ogg` — only when the
  per-integration `callRecordingEnabled` flag is set (default false).
- The recording queue is **node-local**:
  `freeswitch-recordings:<nodeId>`, consumed only by that node's
  co-located `freeswitch` worker process (never the shared `integration`
  queue, whose consumers don't have the file). `RECORD_STOP` enqueues
  `rec-upload-<rootUuid>`; the sweep tick (every 60s, run by the same
  leader) also scans the volume for `.ogg` files whose uuid is no longer a
  live channel and is older than 30 seconds, and enqueues the same
  idempotent `jobId` if the `RECORD_STOP` event was lost.
- Upload retries with exponential backoff (5 attempts, 30s base) and only
  deletes the local file after a successful S3 upload; a permanently
  unresolvable integration (deleted) moves the file to
  `RECORDINGS_DIR/orphans/` instead of retrying forever.
- On upload success the worker enqueues
  `whatsappCallRecordingReady { callId, workspaceId, recordingPath }`,
  drops an audio activity message (`sourceId = "wacall-rec-<callId>"`),
  fires the `callRecorded` event/realtime broadcast, and chains
  `transcribeCall` on the dedicated `callTranscription` queue
  (`jobId = "transcribe-<callId>"`).
- Retention: daily job `purgeExpiredCallRecordings` (05:00 cron,
  `apps/worker/src/schedule/handlers/purge-expired-call-recordings.ts`)
  batches through recordings older than `callRecordingRetentionDays`
  (default **90**), deletes the S3 object and clears `recordingPath`/
  `recordedAt`, but keeps the transcript.
- Transcription is **opt-in per integration** (`callTranscriptionEnabled`,
  default false) and requires a workspace OpenAI integration exposing a
  transcription provider (model `whisper-1`); it is rate-limited via a
  BullMQ `limiter` at `CALL_TRANSCRIBE_PER_MIN` (default 10/min) so a call
  spike cannot burn the AI budget. Missing prerequisites are skipped
  silently, not retried.
- Playback is via signed, workspace-scoped URLs (`getSignedFileUrl`,
  15-minute expiry) — recordings are never served from a public URL.

## 8. Security

| Path | Mechanism |
|---|---|
| Inbound Meta webhook (`messages`/`calls`) | `x-hub-signature-256` HMAC over the raw body, verified before any JSON parsing (`integrations/whatsapp/src/handlers/webhook.ts` → `signature-policy.ts`). Secret is the integration's own Meta App Secret. |
| Manual/self-managed integrations without an App Secret | `signature-policy.ts`'s policy table treats this as `"legacy-unverified"` — **the HMAC check is bypassed entirely** for any `manualIntegration` config that has never had a client secret configured. Every such request is accepted regardless of signature; a `logger.warn` fires on every request so the gap stays visible, but nothing blocks or throttles it. A platform-credential (non-manual) integration missing a secret is treated as misconfiguration and does 401, not this bypass. |
| xml_curl responder (`POST /api/freeswitch/xml`) | HTTPS-only in production; HTTP Basic auth against `FS_XML_BASIC_USER`/`FS_XML_BASIC_PASS` using a hand-rolled constant-time string compare (`timingSafeStringEqual`, `packages/utils/src/crypto.ts` — short-circuits on length mismatch, not Node's `crypto.timingSafeEqual`); then an IP allowlist against `FS_XML_ALLOWED_IPS`; then a fixed-window rate limit (10s/60 req, Redis-backed with an in-memory fallback). Deny-by-default: if either Basic-auth env var is unset, every request 401s. |
| xml_curl responder — proxy-aware allowlist | The IP allowlist only trusts `X-Forwarded-For`/`X-Real-Ip` when `FS_XML_TRUSTED_PROXY_CIDRS` is configured, peeling proxy hops right-to-left. **If that variable is unset, the allowlist check is skipped entirely** (not fail-closed) — logged once, not blocked. Basic auth remains the only real gate in that case; operators must set the trusted-proxy CIDRs for the allowlist to do anything. |
| Secrets in the xml_curl response | SIP digest passwords are decrypted server-side only inside the response body and are never logged; the route's error paths always return the generic `NOT_FOUND_DOCUMENT` XML rather than leaking parse errors. |
| ESL command surface | Only an explicit allow-list of commands (`sofia profile rescan`, `startgw`/`killgw <gw>`, `sofia status gateway <gw>`, `uuid_kill <uuid>`) can be sent, each with its own regex-validated argument (`packages/worker-config/src/queues/freeswitch/commands.ts`) — never a raw user-supplied string. |
| Meta SIP TLS | `tls-verify-policy=out` on the `whatsapp` profile — validates Meta's certificate on our outbound leg, never requests a client certificate from Meta's inbound connection (Meta's docs explicitly forbid that). |
| Encrypted secrets | SIP digest passwords (integration + per-agent softphone credentials) are stored **encrypted**, not hashed, via `encryptUtils` — FreeSWITCH digest auth needs the clear-text password at lookup time. |

## 9. Operations

- **Reconciliation tick**: every 60 seconds, the ESL leader lists live
  channel UUIDs (`show channels as json`) and finalizes any `ringing`/
  `accepted` `WhatsappCall` row on this node whose `freeswitchUuid` is no
  longer live (`completed` if it had been `accepted`, else `failed`,
  `lastError: "reconciled-after-esl-gap"`). The same tick runs the
  recording-file sweep (§7). This is the backstop for the in-memory event
  batcher's fire-and-forget flush (`event-batcher.ts`), which silently
  drops a batch of ESL events on a Redis write failure.
- **ESL leader election**: `distributedLock.runExclusive({ key:
  "freeswitch-esl:<nodeId>", timeoutInSeconds: 30 })`; only one
  `worker:freeswitch` replica per node holds the ESL subscription and the
  two per-node BullMQ consumers at a time. Losing/failing to acquire the
  lock retries with a 5-second backoff.
- **Logs to watch**: `sofia::gateway_state` transitions to `DOWN`/`FAILED`/
  `FAIL_WAIT` (written into `IntegrationWhatsapp.sipLastError`), the
  worker's `"Lost events"` warning from ESL (means the reconciliation tick
  is the only thing keeping call state correct until it next runs), and
  `signature-policy.ts`'s `manual-integration-without-app-secret` warning
  (means a webhook path is running fully unauthenticated).
- **`sofia status`** / **`sofia status gateway wa-<id>`** via `fs_cli` on
  the FreeSWITCH host (or over ESL) is the fastest way to check profile
  health and whether a number's gateway is registered/`NOREG`.
- Common Meta-side errors: **138015/138018** (calling not enabled /
  ineligible number — recheck the messaging-limit tier and `calls`
  webhook subscription), **131055** (business-initiated calling
  unavailable in the destination country), **403** on the SIP leg
  (permission/duplicate-attempt, or a `From` header that doesn't match the
  configured hostname), **407** (SIP digest auth failure toward Meta —
  check the stored SIP password hasn't rotated on Meta's side), **488**
  (media negotiation failure — usually SRTP/codec mismatch; expected
  negotiation is SDES + Opus first).

## 10. Real-number release gate

Before enabling calling on a real, non-test Meta number, confirm all of the
following against one staging number:

- The §3 container test is green.
- Provisioning reaches `provisioned` and the settings action reaches
  `enabled` with a successful Meta read-back.
- Inbound: the INVITE hits the `whatsapp` profile (sip-trace), the 401
  digest challenge is answered by Meta, Meta never receives a client-cert
  request, SDES + Opus negotiate without a 488, the real header casing
  Meta sends is observed and matches what the responder reads, the 20s
  (no-answer)/30s (mid-call) auto-termination behaves as expected in both
  the unanswered and answered cases, and BYE finalizes the row while
  `call_created`/`terminate` webhooks reconcile onto the same row.
- Outbound: a 407 response drives the gateway's digest auth correctly,
  ringing and answer work end to end, a duplicate/permission-denied
  attempt surfaces Meta's 403, the configured `From`-domain is accepted by
  Meta, and no re-INVITE is sent over a sustained call.
- An agent behind NAT with a TURN-only ICE policy gets two-way audio.
- A recording uploads and is playable via a signed URL.
- Deprovisioning cleanly removes the FreeSWITCH gateway.

## Notes & limitations (beta)

- Transcription requires an OpenAI integration on the workspace; without it
  the recording is still saved and playable.
- Outbound (business-initiated) calls require a granted, unexpired call
  permission from the contact (see the permission request composer
  action).
- The 20-second no-audio and 30-second silence auto-termination behaviors
  (and their billing implications) are Meta-side and apply unchanged.
- Meta caps concurrent calls per business number and allows only one SIP
  `servers[]` hostname per number — scale-out is by sharding workspaces
  across FreeSWITCH nodes (§4), never a shared pool.
