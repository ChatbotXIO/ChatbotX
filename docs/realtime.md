# Realtime

One socket per browser tab, per workspace: `WorkspaceRealtimeProvider`
(`apps/builder/src/features/realtime/workspace-realtime-provider.tsx`) is
mounted once, around `{children}`, in
`apps/builder/src/app/space/[workspaceId]/layout.tsx`. Features subscribe
through its hooks rather than creating another workspace socket. The guest
webchat socket is separate and scoped to a guest conversation.

## Redis-stream relay release gate

The Redis-stream relay is a single deployment unit split across three pull
requests for review. **Never deploy or merge only a subset.** Merge all three
back-to-back, then deploy Builder, Worker, and Realtime together:

1. publishers append protocol records to `rt:{shard}`;
2. Realtime consumes those records and delivers them to sockets; and
3. Builder mints the v2 member tokens (`iatMs`, `chatScope`) the gateway
   validates.

Deploying only the publisher PR silently stops realtime delivery because no
consumer reads the stream. A rollback must restore the whole deployment unit,
not one service.

## Gateway runtime, local development, and authentication

`apps/realtime` runs a uWebSockets.js gateway. It consumes durable Redis
Streams records from `rt:{shard}` and serves member sockets at
`/rt/workspaces/:workspaceId` plus guest sockets at
`/rt/guests/:guestConversationId`. The gateway replays a valid `lastSeq`
cursor before live fan-out; malformed, expired, or overrun cursors close with
the resync code rather than leaving a silent event gap.

Builder mints short-lived, purpose-bound JWTs with
`REALTIME_BROADCAST_SECRET`. Before upgrade, the gateway verifies token
signature, audience, purpose, path binding, expiry, and the member revoke
marker. Guest token minting also requires a valid webchat access token,
authorized embed or first-party origin, and a workspace that is not scheduled
for deletion.

For local development, configure:

```dotenv
NEXT_PUBLIC_BUILDER_URL=http://localhost:3123
REALTIME_BROADCAST_SECRET=<at-least-32-characters>
REALTIME_HOST=0.0.0.0
REDIS_URL=redis://localhost:6379
```

Start Redis and Builder with Docker, then run `pnpm --filter realtime dev`.
Use `REALTIME_HOST`, not `HOSTNAME`: Docker owns `HOSTNAME`.

## Stream retention, replay, and close codes

Each `rt:{shard}` stream retains entries for approximately five minutes and
is also capped at approximately 10,000 entries. Replay is therefore
best-effort, not durable delivery: a client reconnects with its last `seq`,
and must resync its cached data when the gateway reports an expired, invalid,
or oversized replay window.

| Code | Meaning | Client action |
| --- | --- | --- |
| 4000 | Heartbeat timeout detected by the client | Reconnect normally. |
| 4001 | Membership revoked or workspace deleted | Stop reconnecting. |
| 4002 | Replay or live-stream gap, including a dropped slow-consumer buffer | Invalidate and refetch realtime-backed data, then reconnect with jittered backoff. |
| 4003 | Gateway capacity limit | Reconnect after the JSON `retryAfter` hint. |
| 4004 | Connection lifetime, membership, permission, or team change | Mint a fresh token and reconnect with the existing replay cursor. |
`4002` is raised for `invalid-last-seq`, `replay-cursor-ahead`,
`replay-window-expired`, `replay-window-too-large`, `backpressure-drop`,
`replay-entries-dropped`, `malformed-stream-record`, `stream-reader-recovered`,
`send-failed`, and `recent-entries-expired`. Each reason requires the same
authoritative resync; the gateway logs the specific cause for diagnosis.


## Connection and delivery

- Member tabs connect to `/rt/workspaces/:workspaceId` with a short-lived
  workspace-bound token. Guest tabs connect to `/rt/guests/:guestConversationId`
  with a token bound to both the conversation and its workspace.
- On every workspace-socket open, the gateway first sends an empty cursor frame
  (`{"batch":[],"seq":"<stream-id>"}`). The client adopts this cursor before
  handling live deliveries; if a reconnect closes before that frame arrives,
  it falls back to `lastSeq=0-0` so the gateway can force a safe resync.
- Full-access members receive one `{"batch":[…],"seq":"<stream-id>"}` frame per
  workspace record. Assigned-only members receive one filtered frame per record;
  unrouted events are full-access only. Directed member events use the local
  member-connection map; a workspace-member deletion closes with code `4001`,
  while a permissions/team-membership change (the member is still in the
  workspace) closes with the non-terminal `4004` instead.
- Every socket subscribes to the gateway's `hb` topic. The gateway publishes a
  heartbeat every 25 seconds (whole-server interval). Clients independently
  self-close with code `4000` after 60 seconds without any frame at all — this
  is a client-side timer (`RealtimeSocket`'s `heartbeatTimeoutMs`), not a
  server-enforced idle timeout; the server never closes a connection for
  being quiet.
- A member's existing connections are revoked immediately
  (`revokeWorkspaceMemberRealtimeConnections`): already-open sockets close
  live, and a TTL'd `realtime:revoked:{workspaceId}:{userId}` marker makes
  every *new* connect attempt — with or without a `lastSeq` to replay through
  — check the revoke against the token's `iat` before admitting it, so a
  still-unexpired pre-revoke token can't reconnect either.

The contract is at-least-once. `seq` is strictly increasing per socket; clients
deduplicate only complete record frames, not individual events in a batch.

## Streams and recovery

The gateway activates only shards with local workspace or guest sockets. One
Redis connection runs `XREAD BLOCK 1000 COUNT 200` across active shards; no
consumer group is used. Every replica therefore observes the same records, so
load-balancer workspace affinity is an optional efficiency optimization, not a
correctness requirement.

### `useWorkspaceRealtimeEvents`

- Pass a `RealtimeHandlerMap` (`features/realtime/types.ts`): at most one
  handler per `RealtimeEventName`.
- The SET of event names you subscribe to should stay stable across
  renders — that is what drives (un)registration. A handler function
  changing identity across renders (a fresh closure capturing new props)
  never re-subscribes; the latest handler is always the one invoked.
- Unregisters automatically on unmount.
- Never open another workspace socket yourself. If you need the connection's
  lifecycle (for example, to show “reconnecting…”), use
  `useWorkspaceRealtimeContext().status`; it never gates subscription
  registration.

If the reader's single Redis connection errors (any active shard), the first
successful read after it recovers forces every locally-connected socket to
resync — an outage that outlasted the stream's retention window would
otherwise silently skip the gap instead of erroring. A stream record whose
`workspaceId` can't be recovered even loosely forces every workspace sharing
that record's shard to resync, since there's no single workspace to target.

An event is only dispatched to subscribers if:
1. At least one subscriber registered for that `eventType` (an event this
   build does not know about, or one nobody subscribed to, is silently
   ignored — this keeps staggered deploys forward-compatible).
2. When a zod schema exists for that event in
   `features/realtime/realtime-event-validation.ts` (sourced from
   `@chatbotx.io/realtime-protocol`), the payload passes it. A schema failure
   is logged (`logger.warn`) and the event is dropped — your handler is never
   called with a payload that failed validation.

Not every event has a schema today (e.g. `messageCreated` carries
`data: unknown`) — narrow it yourself in your handler. Never invent a new
schema in `features/realtime/`; only reuse schemas that already exist in
`realtime-protocol`.

The gateway reports presence after a user's first local socket opens or last
local socket closes. Reports are coalesced per workspace for one second, and
the periodic report is concurrency-bounded.

Guest sockets deliberately ignore `lastSeq`: each opens from the activation
cursor, and the webchat client refetches its newest message page after a reopen.

## Limits

| Limit | Default | Configured via | Scope |
| --- | --- | --- | --- |
| Total connections | 10,000 | `REALTIME_MAX_CONNECTIONS` | whole server |
| Guest connections | 8,000 | `REALTIME_MAX_GUEST_CONNECTIONS` | whole server (sub-pool of the total above) |
| Member connections per workspace | 500 | `REALTIME_MAX_CONNECTIONS_PER_WORKSPACE` | one workspace |
| Guest connections per workspace | 1,000 | `REALTIME_MAX_GUEST_CONNECTIONS_PER_WORKSPACE` | one workspace, across every guest conversation |
| Connections per guest conversation | 5 | `REALTIME_MAX_CONNECTIONS_PER_GUEST` | one `guestConversationId` |
| Forced reconnect (connection lifetime) | 30 minutes ±15% jitter | `REALTIME_CONNECTION_LIFETIME_MS` | per socket |
| Connect token TTL | 60 seconds | — | per mint |
| Replay window | 500 entries / 5 minutes | — | per upgrade |
| Backpressure buffer | 512,000 bytes (~500 KiB) | — | per socket |
| Server heartbeat publish interval | 25s | — | whole server |
| Client self-closes on silence (no frame at all) | 60s | — | per socket (client-side timer, not server-enforced) |

Hitting any connection-count limit above completes the WebSocket handshake
and then immediately closes with `4003` and a jittered `retryAfter` (1–5s) in
the close reason, so the client's backoff is server-directed rather than
guessed.

**Server-reported presence:** Realtime maintains a `Set` of distinct connected
member ids for each workspace. On a member’s first local socket it schedules a
coalesced report; after the last closes it reports the empty set. While members
remain connected, the gateway repeats reports at `PRESENCE_REPORT_INTERVAL_MS`.
Several browser tabs for the same member produce one id in the report.

`reportWorkspacePresence` truncates the user-id list before hashing and
sending. It POSTs to `/api/workspace-presence/report` with a bearer token
signed by `REALTIME_BROADCAST_SECRET`, an explicit `presence-report` purpose,
a workspace audience, and a hash of the bounded body. The route verifies the
token before parsing JSON, recomputes the hash, and calls
`workspacePresenceService.heartbeatMany`. It answers `200 { ok: true }` after
authentication even when the write fails, because the next report supersedes a
lost one and retrying would create a storm.

The Redis lease is the source of truth for online state. A crash, sleep, lost
network, or closed tab becomes offline after `PRESENCE_TTL_MS` without a
tombstone or database “offline” write. The database `onlineSince` stamp is
best-effort reporting metadata only. A member revoked mid-session is handled
by the durable `member-revoke` stream record and the connect-time revoke
marker; the presence reporter never re-implements membership authorization.

**Redis is the ONLY source of truth for "is this member online right
now."** There is no sweeper, no session-expiry check, and no "mark
offline" write anywhere — the TTL already answers that question at read
time via `listOnlineMembers`. On an offline -> online transition (the
batch heartbeat's Lua script reports
which members were NOT already live), `workspacePresenceService.
heartbeatMany` also bulk-stamps `WorkspaceMember.onlineSince = now()` via
`workspaceMemberService.markOnlineBulk` for exactly that subset —
best-effort, logged and swallowed on failure, and a silent no-op per id
for a synthetic platform-support session with no real `WorkspaceMember`
row (AGENTS.md invariant #19). A report where nobody newly transitioned
never touches the database. `onlineSince` is a durable, MONOTONIC "when
did this member last come online" stamp for reporting only — it is never
cleared, so it can never by itself answer whether the member is online
now; that question always goes through Redis. There is deliberately no
`offlineAt` column and no grace window: with a real-time Redis read as the
only source of truth, a grace window would only exist to smooth over an
eventually-consistent DB mirror, which no longer exists. No UI consumer of
`onlineSince` exists yet.

**Redis-outage resilience (owner decision, 2026-09-18):** no read in
`workspacePresenceService` (`listOnlineMembers`) or write
(`heartbeatMany`'s Redis leg) can ever throw out of the service — every
Redis call goes through one shared helper, `withRedisFallback`, that logs
neutrally (not "Redis unavailable" for every failure — a Lua/script bug is
not an outage) with the structured `err` key plus `errName`/`errMessage`,
and returns a safe fallback (`[]`/no newly-live members) instead.
Concretely:
- `listOnlineMembers` degrades to "nobody online" — never an exception
  into a page render or a background job;
- the presence-report route's Redis write degrading this way is exactly
  what keeps it a plain `200`, never a 5xx, on a Redis outage;
- for VoIP ring targets specifically: `selectRingTargetsForCall`
  (`packages/business/src/whatsapp-call/voip-call-service.ts`) calls
  `listOnlineMembers` first and already returns `{ tier: null, userIds: []
  }` for an empty online set — a degraded `[]` is indistinguishable from
  that, so a Redis outage during ring-target resolution takes the SAME
  path `handleConnect` (`apps/worker/src/integration/handlers/
  whatsapp-voip-signaling.ts`) already takes for "nobody online": an
  immediate, fenced-CAS-safe `endReservedCall` reject, never a thrown
  exception, a retry loop, or a wait for the independently-scheduled
  `expireIfUnanswered` deadline job. (A FULLY Redis-down outage still fails
  earlier, at `reserveIncomingCall`/`readControl`'s own `casStore` calls,
  unaffected by presence — that failure mode already has its own bounded
  BullMQ retry + the durable `expireIfUnanswered` safety net, both
  pre-existing and untouched by this change.)

**Flapping-socket caveat:** `listOnlineMembers` scans up to
`PRESENCE_SCAN_LIMIT` (200) members per key — bounded regardless of how
many times a user's tab reconnects, since reconnects now renew the SAME
member id rather than minting a new one.

Ring targets (`selectRingTargetsForCall`,
`packages/business/src/whatsapp-call/voip-call-service.ts`) read
`listOnlineMembers` and then filter to members eligible per plan D3
(`CALL_ELIGIBILITY_RULES`/`isEligibleForConversationCall`, an ordered rule
array): `superAdmin`, OR `contacts`, OR (`onlyAssignedContacts` AND
INDIVIDUALLY assigned to this call's conversation) — BEFORE applying
`MAX_VOIP_RING_TARGETS`. An `onlyAssignedContacts`-only member is never
rung just because they have a tab open; they must be the conversation's
`assignedUserId` (a team-assigned-but-not-individually-assigned
conversation, or an unassigned one, does not count — D2, no auto-claim by
ringing). The conversation snapshot comes from the same `existing` call
row `handleConnect` already reads at the top of the function (no new
query) plus the existing cached `conversationService.findBy` — when the
call's own row was not created yet at ring time (a concurrent job creates
it — see that read's doc comment in `whatsapp-voip-signaling.ts`), the
conversation is `null` and an `onlyAssignedContacts`-only member is
excluded rather than guessed into eligibility. An online member with no
eligible permission at all (e.g. analytics-only, or a synthetic support
session with no member row) is never counted against the cap either. This
whole filter is a P1 stopgap, duplicating `hasContactsAccess`'s permission
rule (moved to `packages/business/src/workspace-member/permissions.ts`,
re-exported from `apps/builder/src/lib/auth/permission-routes.ts`) rather
than a conversation-aware service call; P2's fuller `CALL_ELIGIBILITY_RULES`
replaces it.

### Purpose-bound realtime tokens

Every realtime token includes a `purpose` claim and
`verifyRealtimeToken` (`packages/realtime-protocol/src/auth.ts`) requires it
to exactly match the requested operation. This prevents replay between member
connect and presence-report paths that share a `workspace:<id>` audience and
`REALTIME_BROADCAST_SECRET`.

## Deployment: reverse proxy header requirements

`apps/builder/src/lib/http/same-site-request.ts` (the same-site check
behind `api/whatsapp-voip-call-hangup`)
and `@chatbotx.io/utils`'s `getPublicHostFromRequest`/
`getPublicUrlFromRequest` (OAuth callbacks, `proxy.ts`) all trust the
`Forwarded` and `X-Forwarded-Host` request headers as the deployment's real
public host. Any reverse proxy in front of a ChatbotX deployment (nginx,
an ALB, Cloudflare, etc.) MUST overwrite these headers with the values it
itself determines for the inbound connection — never simply pass through
whatever a client happened to send. This is safe specifically because a
cross-site browser request can never set these headers itself (see the
doc comment in `same-site-request.ts`); that safety depends entirely on
the proxy being the only party between the client and this app that can
set them.

## Consuming calling context optionally

Components that render on every workspace page (inbox rows, call buttons)
but must not crash when calling is disabled for this workspace/member use
`useOptionalWhatsappVoipCallContext()` instead of the strict
`useWhatsappVoipCallContext()` — it returns `null` when the provider is not
mounted, meaning "render no ringing overlay / no call control".
