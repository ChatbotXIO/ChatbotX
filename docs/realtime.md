# Workspace realtime platform

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
- Never open another workspace socket yourself. If you need the connection's
  lifecycle (for example, to show “reconnecting…”), use
  `useWorkspaceRealtimeStatus()`; it never gates subscription registration.

## Validation

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
