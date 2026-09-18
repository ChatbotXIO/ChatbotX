# Workspace realtime platform

One socket per browser tab, per workspace: `WorkspaceRealtimeProvider`
(`apps/builder/src/features/realtime/workspace-realtime-provider.tsx`) is
mounted once, around `{children}`, in
`apps/builder/src/app/space/[workspaceId]/layout.tsx`. Nobody else may call
`usePartySocket` for the `workspaces` party — every feature subscribes
through the hooks below instead. The guest webchat (`guests` party) is a
separate, unrelated socket and is out of scope here.

## Subscribing to events

```tsx
"use client"

import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"

export function MyFeatureRealtime() {
  useWorkspaceRealtimeEvents({
    messageDeleted: (event) => {
      // event.data is typed per `RealtimeEvent<"messageDeleted">`
    },
    conversationAssigned: (event) => {
      // ...
    },
  })

  return null
}
```

- Pass a `RealtimeHandlerMap` (`features/realtime/types.ts`): at most one
  handler per `RealtimeEventName`.
- The SET of event names you subscribe to should stay stable across
  renders — that is what drives (un)registration. A handler function
  changing identity across renders (a fresh closure capturing new props)
  never re-subscribes; the latest handler is always the one invoked.
- Unregisters automatically on unmount.
- Never open a `usePartySocket` connection yourself. If you need the
  connection's own lifecycle (e.g. to show a "reconnecting…" indicator), use
  `useWorkspaceRealtimeStatus()` — it never gates whether your subscription
  is registered.

## Validation

An event is only dispatched to subscribers if:
1. At least one subscriber registered for that `eventType` (an event this
   build does not know about, or one nobody subscribed to, is silently
   ignored — this keeps staggered deploys forward-compatible).
2. When a zod schema exists for that event in
   `features/realtime/realtime-event-validation.ts` (sourced from
   `@chatbotx.io/partysocket-config`), the payload passes it. A schema
   failure is logged (`logger.warn`) and the event is dropped — your
   handler is never called with a payload that failed validation.

Not every event has a schema today (e.g. `messageCreated` carries
`data: unknown`) — narrow it yourself in your handler. Never invent a new
schema in `features/realtime/`; only reuse schemas that already exist in
`partysocket-config`.

## What lives where

- `features/realtime/` is channel-agnostic: it must never import chat or
  WhatsApp code. It only knows about `RealtimeEventName`/`RealtimeEventData`
  from `@chatbotx.io/partysocket-config`.
- Chat's subscriber: `features/chat/chat-realtime.tsx` (`ChatRealtime`).
- WhatsApp calling's subscriber:
  `features/integration-whatsapp/calling/voip/whatsapp-call-realtime.tsx`
  (`WhatsappCallRealtime`) — voip store / query-client only, no
  `ChatStoreProvider` dependency.
- The workspace-level composition of the platform with the calling layer
  (VoIP provider/panel, the call subscriber, the presence lease) lives in
  `apps/builder/src/components/workspace-realtime-shell.tsx`, gated by the
  server-computed contract in the workspace layout
  (`resolveWorkspaceRealtimeGates`, `apps/builder/src/lib/workspace/resolve-workspace-realtime-gates.ts`):
  `realtimeEnabled` (the socket itself — true for any resolved workspace
  access), `callingEnabled` (call control), `callHistoryEnabled` (Calls page
  / call history and artifacts).

## Presence lease

Any feature that needs "who has this workspace open right now" (today:
`selectRingTargetsForCall` in `voip-call-service.ts`) reads through
`workspacePresenceService`
(`packages/business/src/workspace-presence/service.ts`) — channel-agnostic,
not tied to calling.

**Owner-directed simplification (2026-09-18):** presence now mirrors a
widely used online-status-tracker model. ONE
member per USER (not per browser tab), and there is deliberately NO
explicit sign-off: no `pagehide` beacon, no per-tab lease rotation, no
Redis tombstone. Going offline is detected purely by absence.

**Owner-directed move to server-reported presence (2026-09-18, same day):**
presence is no longer heartbeated from the browser at all. The old design —
one server action per browser tab, every 20s — cost an uncached membership
+ workspace DB read per heartbeat (~100 uncached reads/sec at 1,000 online
agents). Presence now flows entirely server-to-server:

- Each `apps/realtime` `workspaces` room (`WorkspaceParty`,
  `apps/realtime/src/parties/workspaces.ts`) already tags every connection
  with its verified `userId` (`onBeforeConnect` + `getConnectionTags`) and
  now ALSO stores that id as the connection's own state
  (`connection.setState`). On the room's FIRST connection it (a) caches
  the room id into `room.storage`, (b) reports that one connecting user's
  presence IMMEDIATELY (no waiting for the first alarm — otherwise every
  realtime redeploy or first-tab-open leaves a blind window in which an
  inbound call would be rejected as "nobody online"), then (c) schedules a
  PartyKit/Durable-Object **alarm** (`room.storage.setAlarm`, the
  `partykit@0.0.115`/workerd runtime this repo runs supports it, confirmed
  against `node_modules/partykit/server.d.ts`) for
  `PRESENCE_REPORT_INTERVAL_MS` (10s — see below) later. Every connection
  after the first is a no-op here: the alarm is already armed.
- `onAlarm` collects the DISTINCT `userId`s across every open connection in
  the room (`room.getConnections()`, deduped — several tabs of the same
  user report as one), skips the report entirely when the room has gone
  empty (and does not reschedule — the loop simply stops). Otherwise it
  reschedules itself `PRESENCE_REPORT_INTERVAL_MS` out FIRST, BEFORE
  awaiting the report POST — a fixed, latency-independent cadence, so a
  slow or entirely failed report can never delay or skip the next one —
  and only then POSTs ONE request to the builder via
  `reportWorkspacePresence` (`apps/realtime/src/lib/presence-report.ts`).
  `onAlarm` cannot read `Party.id`/`room.context.parties` (a documented
  PartyKit alarm restriction), so the room's own id is cached into
  `room.storage` on the first `onConnect` instead and read back from
  there; the alarm still reschedules even if that cached id is somehow
  missing, so a storage inconsistency never silently stops the loop.
- `onClose` stops the alarm as soon as the room's LAST connection closes
  (computed by excluding the closing connection from `getConnections()`,
  not by trusting removal-timing) rather than waiting for the next alarm
  tick to notice and no-op. It deliberately does NOT also send an
  immediate "went offline" report: the batch write only ever adds/renews
  members, it never removes one, so no report content could make "offline"
  observably faster — only the alarm stopping promptly is worth doing.
- Requests scale with ACTIVE WORKSPACES (rooms with at least one
  connection), never with agent count or heartbeat frequency — a workspace
  with 500 online agents still sends exactly one report every
  `PRESENCE_REPORT_INTERVAL_MS`, not 500.
- A room with more connected users than `MAX_PRESENCE_USER_IDS_PER_REPORT`
  (5,000, `@chatbotx.io/partysocket-config/presence`) has its report
  truncated to the cap before it is ever sent, rather than sending an
  oversized batch that would otherwise have to be rejected — an oversized
  workspace reports its first 5,000 connected members rather than going
  dark entirely.

### Self-healing the report loop

The alarm loop above can silently stop ticking (process restart timing, a
supervisor handoff, a runtime-specific alarm-delivery gap) with no
exception anywhere to notice. `WorkspaceParty` tracks this with a
FRESHNESS marker instead of trusting `getAlarm() !== null` — a durable
`presenceLastArmedAt` timestamp refreshed on every healthy `onAlarm` tick.
`ensureReportLoopArmed` re-bootstraps (re-reports immediately, re-arms the
alarm) whenever that marker is missing or older than
`PRESENCE_REPORT_INTERVAL_MS * 1.5`, and is a no-op otherwise — so a
healthy loop pays no extra cost. Three independent triggers call it, each
covering a gap the other two cannot:

1. **`onConnect`** — a new connection (every realtime redeploy, every tab
   opening the inbox).
2. **`onRequest`** — any inbound workspace-wide broadcast/targeted-send/
   revoke request from the builder.
3. **`onMessage` (client keep-alive ping)** — a QUIET room (an
   already-open tab, no new connection, no inbound broadcast) has neither
   of the other two triggers. The builder client
   (`WorkspaceRealtimeProvider`,
   `apps/builder/src/features/realtime/workspace-realtime-provider.tsx`)
   sends a tiny frame — `{ type: "presence-ping" }`,
   `serializePresencePingMessage()` in
   `@chatbotx.io/partysocket-config/presence` — over the ALREADY-OPEN
   workspace socket every `PRESENCE_REPORT_INTERVAL_MS`, the SAME interval
   the realtime side reports on (both owned in one module so they cannot
   drift). This follows a widely used presence pattern: a heartbeat sent
   over the existing open socket every 20s rather than a new connection.
   It is deliberately NOT a new HTTP request, server action, or
   auth round trip — no DB, no session — just one more frame on the socket
   the tab already holds open, so it never reintroduces the per-tab HTTP
   heartbeat cost the server-reported design replaced.

   `WorkspaceParty.onMessage` validates the frame against
   `presencePingMessageSchema` (the only client→server message this socket
   carries) and ignores anything else — malformed JSON, an unknown message
   type, or a ping from a connection whose state was never set by
   `onConnect` (never authenticated/tagged). A validated ping calls
   `ensureReportLoopArmed()` with no seed id, since the pinging connection
   is already visible in `collectConnectedUserIds()`. It is routed through
   the SAME serialized lock `onConnect` uses, so a ping storm (many tabs
   pinging back-to-back) can still cause at most one re-arm — combined with
   the freshness gate, a room with N tabs pinging every interval costs
   essentially nothing beyond the frames themselves in the common case
   where the loop is already healthy.

`PRESENCE_REPORT_INTERVAL_MS` and `PRESENCE_TTL_MS` are owned together in
ONE place, `@chatbotx.io/partysocket-config/presence` (imported by both
`apps/realtime` and `packages/business`), specifically so they cannot drift
apart again: the report interval (10s) is HALF the TTL (20s), enforced by
both a guard test and an import-time assertion, so a single slow or lost
report always leaves a full report interval's worth of margin before the
Redis entry would expire.

The report is authenticated the same JWT scheme the party already uses to
authenticate INBOUND broadcast requests FROM the builder
(`verifyBroadcastRequest`, `REALTIME_BROADCAST_SECRET`,
`signRealtimeToken`/`verifyRealtimeToken`) — used here in the reverse
direction, not a new scheme, but bound to its own `purpose` claim
(`REALTIME_TOKEN_PURPOSE.presenceReport`) so a broadcast token can never be
replayed against this route and vice versa. It also carries a `bodyHash`
claim — a SHA-256 digest of the (already-truncated) `userIds` it is about
to send — so a captured token cannot be replayed later with a different
member list. It lands on `POST /api/workspace-presence/report`
(`apps/builder/src/app/api/workspace-presence/report/route.ts`), which:
1. reads the bearer token AND the `workspaceId` query param (never the
   body — this lets the route verify the signature before ever parsing
   JSON);
2. verifies the token's signature, expiry, audience, and purpose — any
   failure answers 401 before the body is parsed;
3. parses the body (`{ userIds }`) and truncates it to the same cap the
   realtime side already applied;
4. recomputes the `bodyHash` over that truncated set and compares it to
   the token's claim — a mismatch (tampered body, or a token minted for a
   different member list) answers 401;
5. calls `workspacePresenceService.heartbeatMany` — ONE Redis round-trip
   (`presenceStore.heartbeatMany`, a single Lua script doing the prune +
   every `ZADD` + `PEXPIRE`) for the whole batch, then ONE bulk database
   UPDATE (`workspaceMemberService.markOnlineBulk`) for exactly the subset
   that just transitioned offline -> online.

No session, no cookie, no CSRF surface — `/api/*` already bypasses the
sign-in middleware (`PUBLIC_ROUTES` in
`apps/builder/src/lib/public-routes.ts`), so no change was needed there.
The route always answers `200 { ok: true }` once past auth, even on an
internal `heartbeatMany` failure (logged, never surfaced as a 5xx) — the
realtime server's own caller has no retry logic either, since the next
report supersedes a lost one, so a 5xx here would only risk a pointless
retry storm.

A member removed from a workspace mid-session is still covered by the
EXISTING `?action=revoke` connection-close path
(`revokeWorkspaceMemberConnections`, called on membership removal) — that
closes their tagged sockets immediately, which is what stops that user
from being counted in the NEXT presence report (or any report at all, once
their last socket in the room closes and, if they were the last connection
overall, the alarm loop stops). Presence itself never re-implements
membership revocation; it only reports whoever the realtime layer already
considers connected.

Multi-pod / multiple Durable Object instances for the same room cannot
happen in this deployment: `workspaces` rooms are keyed by workspace id
and PartyKit binds a room id to exactly one Durable Object instance, so
there is exactly one alarm loop and one `room.storage` per workspace,
never a race between two reporters double-writing or double-scheduling.

The `PRESENCE_TTL_MS` (20s) TTL is the ONLY backstop for "went offline": a
crash, sleep, lost network, or closed tab all resolve the same way —
silence for the TTL, then the Redis entry expires on its own.
`presenceStore` also prunes every already-expired member on each heartbeat
(not only on a `listOnlineMembers` read), so a key kept alive by one live
user can't accumulate long-departed members forever. (The pre-P1
`voip:presence:<workspaceId>` compat key that `listOnlineMembers` used to
also merge in for one rolling-deploy window has been removed — it only
ever existed on this unreleased branch, so there was never a build in the
field that still wrote to it.)

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

### Safe deploy order & rolling-deploy token compatibility (round-2 review, 2026-09-18)

`verifyRealtimeToken` (`packages/partysocket-config/src/auth.ts`) rejects a
token whose `purpose` claim does not match the purpose being verified —
this is what stops a broadcast token from being replayed against the
presence-report route or vice versa (MEDIUM-3). Taken literally, that also
means a token minted by a NOT-yet-updated process — one still running code
from before the `purpose` claim was introduced, i.e. production `main`
before this branch — carries NO `purpose` claim at all and would fail
verification outright. `apps/builder` and `apps/worker` are the only two
processes that ever mint a `broadcast`-purpose token
(`packages/partysocket-config/src/lib.ts`), so during any deploy where
`apps/realtime` finishes rolling out before they do, EVERY inbound
broadcast request to `apps/realtime` — including WhatsApp call
ring/answer/ended events — would 401 for the whole rollout window.

**There is no enforced or documented ordering that would make this
unnecessary.** `scripts/deployment/upgrade.sh` stops and starts
`builder worker realtime` as one undifferentiated group
(`docker compose ... down builder worker realtime`, then
`up -d builder worker realtime`); Docker Compose gives no ordering
guarantee across services started in the same command, and any real
staggered/rolling deploy (blue-green, k8s rolling update, etc.) can land in
either order. Operators SHOULD still prefer rolling `apps/builder` and
`apps/worker` out before `apps/realtime` where their deployment tooling
allows it — it shortens how long the compatibility window below is
actually exercised — but the code cannot assume this happens.

**The fix is a narrow, self-closing compatibility window**, not a blanket
exception:
- Only `verifyBroadcastRequest` (`apps/realtime/src/lib/realtime-auth.ts`)
  passes `{ allowLegacyMissingPurpose: true }` to `verifyRealtimeToken`. A
  token with NO `purpose` claim verifies as if it matched, but a token
  carrying the WRONG purpose is still rejected unconditionally.
- `verifyMemberConnectToken` (the `onBeforeConnect` websocket-upgrade path)
  and the presence-report route deliberately do NOT get this exception.
  Both the `member-connect` and `presence-report` purposes are brand new to
  this branch — production `main` never minted a JWT for either (the old
  `onBeforeConnect` authenticated via a session cookie, `getAuthSession`,
  not a JWT at all) — so no purpose-less token of either kind can ever
  legitimately exist. Granting the exception there too would have been a
  privilege escalation: `verifyMemberConnectToken` and `verifyBroadcastRequest`
  bind to the IDENTICAL `workspace:<id>` audience shape for the same room
  and the same shared `REALTIME_BROADCAST_SECRET`, so a purpose-less
  member-connect token (had the exception applied there) could have been
  replayed as a broadcast-authorized request — able to `room.broadcast`,
  target-send, or revoke connections — a capability a plain per-member
  connect token was never meant to carry.
- The window is self-closing on wall-clock time, independent of any single
  token's own `iat`/`exp`: `LEGACY_PURPOSE_WINDOW_CUTOFF`
  (`packages/partysocket-config/src/auth.ts`), currently
  `2026-09-25T00:00:00.000Z` (one week after this change), is checked on
  every verification — once `Date.now()` passes it, the exception stops
  being granted at all, regardless of `allowLegacyMissingPurpose`. This
  guards against a stuck/zombie old-code pod that stays up far longer than
  an ordinary rolling deploy and keeps minting fresh purpose-less tokens
  indefinitely; an individual captured token is separately bounded to its
  own 60s TTL either way.

**Follow-up (tracked, not yet done):** once a full production rollout has
gone out with the `purpose` claim in place (so no process can still be
minting purpose-less broadcast tokens), remove
`allowLegacyMissingPurpose`/`VerifyRealtimeTokenOptions` and
`LEGACY_PURPOSE_WINDOW_CUTOFF` entirely, and make `verifyBroadcastRequest`
strict like the other two paths.

### §3.3 connection-count load test — result

Ran a throwaway load test against the REAL
`apps/realtime` Docker image (`docker-compose.dev.yml`'s `realtime`
service, built from `apps/realtime/docker/Dockerfile`) on 2026-09-17: 150
authenticated WebSocket connections to one `workspaces` room, one
targeted send (verified reaching the exact selected connection id, not
just a count), one broadcast.

- **Environment:** local OrbStack Docker, the `realtime` service built and
  run standalone (`docker compose -f docker-compose.dev.yml build realtime`
  then `up --no-deps realtime`), talking to the host's real
  `REALTIME_BROADCAST_SECRET`. `WorkspaceParty` does not enable
  `options.hibernate` — this run did NOT need it.
- **Result:** 150/150 connections established (~1.05s), targeted send
  reached exactly the selected connection id and no other, broadcast
  reached 150/150 connections. No connections refused or dropped.
- **Caveat found while running this:** the Dockerfile deliberately does
  NOT copy `.env` into the image (`# COPY --from=pre /app/.env .env`,
  commented out) and relies on `docker-compose.yml`'s `env_file` to inject
  vars into the container's process environment — but `partykit dev`'s own
  env loading for the code it bundles into the workerd/Miniflare sandbox
  reads a literal `.env` FILE in its working directory, not inherited
  `process.env` (confirmed: `docker exec ... env` showed
  `REALTIME_BROADCAST_SECRET` present, yet the container failed to boot
  with `Invalid environment variables` until a physical `.env` file was
  written into it). This is an infra gap in the `realtime` service's
  Docker image unrelated to this presence-lease change; the container
  used for this load test had a `.env` file manually written in for the
  one run and was torn down (image kept, container removed) afterward.
  Tracked as a follow-up, not fixed here (out of scope for this review).
- This is evidence against §3.3's documented ~100-connection concern for
  this specific container image at 150 connections; it does not test
  Cloudflare's hosted Workers runtime, only self-hosted `partykit dev` (in
  the container it actually ships in, `docker-compose.dev.yml`'s
  `realtime` service). Re-verified with the target host configurable
  (`REALTIME_LOAD_TEST_HOST`, not hardcoded to local `partykit dev`) —
  evidence (`docker compose ps` output, the target URL, and per-assertion
  results including the targeted recipient's identity) is in the
  scratchpad as `realtime-load-test-container.log`, not committed here.

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
