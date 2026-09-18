# WhatsApp calling — parity plan (items 1, 2, 3, 4, 5, 7)

Status: **v13 — APPROVABLE per Codex review #11** (awaiting owner approval). No code written for this plan
(the working tree contains unrelated in-flight calling work, see §2.3).

Scope decided by the owner: 1 global ringing, 2 ring the right agents, 3 Calls page, 4 auto-assign,
5 more call entry points, 7 small items. Item 6 (public REST API) is skipped.

Every reference-behavior claim in §2.2 was verified against a pinned commit of the reference
implementation this plan targets for parity (paths in that section are relative to its repo). Every
"ChatbotX has Y" cites this repo as on disk. Anything not verified is labelled **VERIFY** with the
exact check to run before coding that step.

---

## 1. Code-quality contract (owner requirements → how this plan satisfies them)

| Requirement | Applied as |
|---|---|
| Check docs, never guess | PartyKit docs checked (§3.3); every open point is a **VERIFY** step, not an assumption |
| Modular, no if-else chains | Ordered strategy arrays (`RING_TIERS`, `CALL_KIND_RULES`), lookup objects/sets (`CALL_ACTIVITY_FILTERS`, `LEAVE_CONFIRMATION_PHASES`, `CALL_BACK_STATUSES_BY_DIRECTION`), event handler maps per feature |
| Shared files not channel-specific | `features/realtime/*` and `workspace-presence` know nothing about WhatsApp or chat; WhatsApp code stays under `integration-whatsapp` / `whatsapp-call` |
| Enums / objects / arrays for business rules | `RealtimeEventType` (existing), `whatsappCallOutcome` pgEnum + zod enum, `RingTierName`, kind/filter maps |
| Reuse existing handlers | `presenceStore` + heartbeat action refined, `updateAssignment` side effects extracted not copied, `resolveRingTargets` split not replaced, `resolveWhatsappCallActivityLabelKey` reused for labels, `WhatsappVoipCallButton` logic extracted into a hook |
| Clean, scalable, project standard | Layering action → service → repository; feature folders; skills `business-data-access`, `orpc-api`, `feature-scaffold`, `builder-ui-i18n`, `drizzle-database`, `reliability-concurrency`, `testing-workflow` read before each phase |
| Design patterns | Observer / pub-sub (realtime subscribers), Strategy + Chain of Responsibility (ring tiers, kind rules), Repository (data), shared publisher for assignment side effects |
| Business layer | New reads/writes in `packages/business` services + `packages/database` repositories |
| No `any` | `RealtimeEvent<K>` extracted from the `RealtimeEventData` discriminated union keyed by `RealtimeEventName`; payloads validated with existing zod schemas or kept `unknown` and narrowed by subscribers |
| Naming | camelCase functions/vars, PascalCase types/components, UPPER_SNAKE constants |
| No duplicate code / queries | One `isEligibleForConversationCall` predicate for ringing, pickup, resume, TURN and call reads; one call-read scope; one assignment publisher |
| Model not raw SQL; no injection | Drizzle query builder only (`eq`, `and`, `isNull`, `inArray`, `lt`); no `sql` template with interpolated input; new writes go through repositories even where the surrounding legacy service writes `db` directly |
| Don't break running logic | Each phase lists behaviour-preservation guarantees and the existing tests that must stay green; presence key rename appends the legacy key for one release |
| High request volume | Per-event cost stated per phase; cached reads reused; bounded queries |
| All cases tested | Each phase ends with an explicit test-case list |

---

## 2. Ground truth

### 2.1 ChatbotX today (verified)
- **Calling UI only on the inbox page.** `features/chat/chat-layout.tsx` mounts presence (:66), `ChatRealtime` (:125),
  `WhatsappCallInfoSheet` (:132), `WhatsappVoipCallProvider` + `WhatsappCallPanel` (:139-140).
  `app/space/[workspaceId]/layout.tsx` mounts nothing call-related.
- **The only workspace socket** is opened by `ChatRealtime` (`chat-realtime.tsx:61-76`, `party:"workspaces"`, token
  from `client.realtimeAPI.mintWorkspaceConnectTokenAuthenticatedAPI`). Its `onMessage` is one `switch` over chat and
  call events (:79-216) with an unvalidated cast of `RealtimeEventData` (:81).
- `RealtimeEventData` is a discriminated union on `eventType` (`packages/partysocket-config/src/schemas.ts:310-328`).
- `useChatStore` throws outside `ChatStoreProvider` (`chat-store-provider.tsx:33-35`); the voip store is a
  module-level zustand store (`voip-call-store.ts:285`).
- **Presence today** = HTTP server action every 20 s (`use-whatsapp-voip-presence.ts:11,35-40`,
  `heartbeat-voip-presence.action.ts`) → generic Redis sorted-set `presenceStore`
  (`packages/redis/src/presence-store.ts:12-43`: `heartbeat` / `drop` / `liveMembers`) under key
  `voip:presence:<workspaceId>`, TTL 45 s, cap 10 (`voip-presence-service.ts:10-20`). Not tied to the socket.
  `signOff` has no production caller. Only callers of the presence service: the heartbeat action and
  `voip-call-service.ts`.
- **Realtime server:** `apps/realtime` runs `partykit dev` as a single process in Docker
  (`docker/rootfs/usr/local/bin/docker-entrypoint.sh:3`); dependencies have no Redis client
  (`apps/realtime/package.json`); `WorkspaceParty` tags connections by verified userId (`parties/workspaces.ts:36-39`),
  supports targeted send and revoke (:58-99), and sets no `options.hibernate`.
- **Ring targets** = up to 10 most-recently-present workspace members, no inbox/assignee/permission input
  (`voip-call-service.ts:251-298`); presence is read before the control record is created. `claimForAnswer`,
  `listResumableIncoming`, the answer action and TURN credentials do not check who may take the call (M6,
  `docs/whatsapp-calling-voip.md:154-165`). Expiry is a no-op without a control (`whatsapp-voip-signaling.ts:531-545`).
- **Access model:** member flags `superAdmin, analytics, flows, contacts, onlyAssignedContacts, emailAndPhone,
  broadcast, ecommerce` (`partials/workspace.ts:33-45`); `hasContactsAccess = contacts || onlyAssignedContacts`
  (`permission-routes.ts:30-35`); contact-scope rule `features/contacts/permissions.ts:27-38`. No inbox membership,
  no availability status.
- **Teams:** `inboxTeamService.listByWorkspace` is cached and returns members (`enterprise/inbox-team/service.ts:29-47`).
- **Assignment:** `conversationService.updateAssignment` = unconditional UPDATE → cache invalidate →
  `conversationUpdated` + `conversationAssigned` broadcasts → notification unless self → `emitConversationAssigned` →
  analytics (`conversation/service.ts:878-976`); `TriggerContext` is three strings (:71-75); `assignOne` sets
  `triggerType` itself (:804-834).
- **Calls data:** `WhatsappCall` has no list method; index `(workspaceId, createdAt desc)` "Call log page"
  (`schema/whatsapp-call.ts:183-188`); status is a pgEnum (:37); `canceled` exists only in the activity message.
  Finalizers: `finalizeCallSideEffects`, `endVoipCallAsAgent` (two branches), two outbound failure paths,
  `sweepStaleWhatsappCalls`, signaling wrapper; `recoverStrandedAccepted` is a direct UPDATE (`repository.ts:846`);
  fill-once `FILLABLE_TERMINAL_FIELDS` (`repository.ts:36,936`).
- **Call artifact reads** (`get-call-recording-url`, `get-call-transcript`, `get-call-summary`,
  `generate-call-ai-summary` actions) check workspace membership only.
- **Conversation link** `/space/${ws}/inbox?conversationId=${id}`; no message deep link.
- **Preview** `resolveLastMessagePreview` returns `message.text`, else an attachment-count fallback (`resolve-last-message-preview.ts:6-21`).
- **Unload** only the `pagehide` hangup beacon (`use-whatsapp-voip-call.ts:1425-1440`).
- **Channel create** iterates `ChannelType` only; connect completion goes through `applyConnectIntent`
  (`use-whatsapp-connect-form.ts:152-200`); nothing enables calling.

### 2.2 Reference behavior (verified)
- Call widget lives in the app shell, rendered while `hasActiveCall || hasIncomingCall`; app-wide socket
  (one connection per client, not scoped to a single page).
- **Presence:** client sends an `update_presence` message over the websocket every 20 s → a server-side
  presence tracker records it in a Redis sorted set with a 20 s window; plus manual status
  online/busy/offline, and a "never auto-offline" opt-out for always-available users.
- **Who rings:** assignee only if assigned; else inbox members who are online; else inbox members ∪ admins.
  The client drops a ring unless the target is online, hides calls assigned to others, and removes a
  ringing entry on reassignment.
- **Accept auth:** the same conversation-visibility policy check used everywhere else in the product.
- **Assign on call:** the accepting agent is assigned only if the conversation had no assignee; outbound
  calls claim the conversation after dialing.
- **Call back** is offered for every non-completed inbound call, so long as no call is active or ringing.
- **Contact call button** with an inbox picker when the contact has more than one eligible inbox.
- **Go to conversation** from the call widget/card, also offered on join.
- **Calls page:** paginated at 25/page; admins/report-manage roles see everything, other agents see their
  own accepted calls within conversations they can access, with an agent filter applied after that scope.
  Kinds: ongoing, incoming, outgoing, missed, no-reply, failed.
- **beforeunload** guard fires while a call is active OR incoming.
- **Preview** in the conversation list shows a dedicated voice-call status line.
- **Channel setup preset:** picking the calling-capable channel type from the channel list routes to a
  channel-specific setup flow that ends by enabling calling on completion.

### 2.3 In flight in the same tree (another session, uncommitted)
`callingEnabled`, `inboundCallsEnabled`, `callHours` columns and the `inboundCallRefusal` gate in `handleConnect`
(`whatsapp-voip-signaling.ts:172-186`, before `resolveRingTargets`). **Prerequisite:** committed before P2 and P5
(single migration chain, no overlapping edits).

---

## 3. Key architecture decisions

### 3.1 One general-purpose workspace realtime connection (owner requirement)
- One socket per tab per workspace, mounted in `app/space/[workspaceId]/layout.tsx` around `children`.
- Features subscribe through typed handler maps; nobody else opens a workspace socket. The guest webchat
  (`guests` party) stays separate.
- Rejected: keeping `ChatRealtime` as socket owner and adding a second socket (double delivery — targeted sends reach
  every tagged connection of a user).

### 3.2 Presence = per-tab lease renewed while the workspace socket is open (options compared)

| Option | Verdict |
|---|---|
| (a) HTTP heartbeat moved to the workspace layout, independent of the socket | Rejected: marks a member online whose socket is closed, so the ring is never delivered |
| (b) Ask the PartyKit room who is connected at ring time | Rejected: process-local state (wrong once realtime runs more than one replica), needs a new party enumeration API, half-open sockets still look connected |
| (c) Heartbeat message over the websocket, party writes Redis (the reference mechanism in §2.2) | Rejected: party code executes in the workerd runtime (`partykit@0.0.115` depends on `miniflare@3.20240718.0`, which depends on workerd), while `packages/redis` is `ioredis` (`packages/redis/package.json:13`), which imports Node `net` for TCP sockets; the party would have to call back over HTTP — the same request volume as (d) plus a hop and a new authenticated endpoint on the party side |
| **(d) Per-tab lease: the tab heartbeats through an authenticated server action only while its workspace socket is `open` (immediately on open, then every 20 s) and signs off only its own tab on socket close / `pagehide`** | **Chosen** |

Design of (d), fixing the multi-tab defect found in review #4 (`presenceStore.drop` is an unconditional `ZREM`, `presence-store.ts:27`):
- **Member id = `${userId}:${tabId}`**, `tabId` = `crypto.randomUUID()` generated once per mounted provider. The server
  action derives `userId` from the session and accepts only the opaque `tabId` (validated with zod as a UUID); a caller can
  never renew or drop another user's lease.
- **Sign-off removes only that tab's member**, so closing one tab never takes a user offline while another tab is open.
  TTL (45 s) remains the fallback for crash, sleep, bfcache and network loss; on resume the socket reconnects, status returns
  to `open` and the tab heartbeats immediately.
- **`listOnlineMembers(workspaceId)`** reads up to `PRESENCE_SCAN_LIMIT` (200) most-recent tab members from the new key, maps them
  to user ids keeping first-seen (most recent) order, and dedupes. No 10-target cap here: capping happens after eligibility in P2's tiers,
  so a large number of ineligible online members can never hide eligible ones within the scan.
- **Rolling deploy:** old tabs lose their heartbeat as soon as the new build ships (server action ids change per build), so a
  compatibility read is only useful for the minutes old builder pods keep serving. For that window `listOnlineMembers` also reads
  up to `PRESENCE_SCAN_LIMIT` members of the legacy `voip:presence:` key (bare user ids), appends the ones not already present, and
  caps the merged list at `PRESENCE_SCAN_LIMIT`; a tracked follow-up removes the legacy read in the next release.
- **Honest limitation:** the lease is conditioned on the client's view of the socket, not proven by a message that travelled over
  it (the reference presence tracker's is, since it renews on a message received by the server). A socket that died without the
  browser noticing keeps renewing until the browser detects the close (partysocket reconnect logic). A heartbeat that fails while
  the socket is open only costs up to 45 s of offline status. Both are accepted and covered by tests; the reference implementation's
  20 s window has the equivalent "silently dead socket" exposure.

Meaning for ringing: a member is online when at least one tab has an open workspace socket and renewed within 45 s.
Manual availability status is out of scope (D11).

### 3.3 Realtime connection count — VERIFY before P1 ships
PartyKit docs (docs.partykit.io, "Scaling PartyKit servers with Hibernation"): a non-hibernating room handles up to
~100 connections; with `options.hibernate: true` up to 32,000. `WorkspaceParty` does not enable hibernation, and P1
raises connections from "inbox tabs" to "all workspace tabs". Whether that limit applies to self-hosted
`partykit dev` 0.0.115 cannot be verified from the repo. **VERIFY:** in the realtime container, open 150
authenticated connections to one room and perform a targeted send and a broadcast. If connections are refused or
dropped, enable `hibernate: true` (the party keeps no in-memory state; tags are the documented lookup) and re-run.

---

## 4. Decisions

| # | Question | Reference behavior (§2.2) | Decision / default |
|---|---|---|---|
| D1 | Assignee has no open workspace tab | Rings only the assignee | Fall through to the next tier |
| D2 | Team-assigned conversation | Team ignored | Tier 2 rings online team members; no auto-claim of team-assigned conversations |
| D3 | Who may handle a conversation's call | `ConversationPolicy#show?` | `superAdmin` OR `contacts` OR (`onlyAssignedContacts` AND assigned to them) |
| D4 | Calls page audience / scope | admins + `report_manage` all; others own accepted calls in accessible conversations; recordings visible to anyone who can see the conversation (attachments) | Page for `hasContactsAccess` OR `analytics`. **List:** superAdmin/`analytics` see all; others see calls where `(answeredByUserId = me OR initiatedByUserId = me) AND D3`. **Single-call artifacts** (recording, transcript, summary): superAdmin/`analytics`, or D3 — unchanged from what the in-conversation card allows today. Agent filter only for superAdmin/`analytics`, scope applied first |
| D5 | Persist display outcome | `end_reason` | New nullable `outcome` pgEnum written together with every terminal `status` write: permitted status advances (incl. the `failed → rejected` repair) rewrite both columns; a same-status redelivery only fills it when null |
| D6 | Navigate to the conversation when answering from another page | Yes | Yes |
| D7 | beforeunload also while ringing | Yes | Yes |
| D8 | Special workspace states | — | **Call control** (ringing, answering, dialing, permission requests, calling configuration) is off during a support session, scheduled deletion, or cloud owner blocked. **Reading** call history and artifacts follows the normal read rules (P5 scopes + each action's existing client): a support session keeps the read access its synthetic `superAdmin` membership already gives to every other workspace record (`docs/support-access.md`), and expired/blocked workspaces keep read access through `workspaceActionClientAllowExpired` as today |
| D9 | Calls page kinds | 6 kinds | Same labels as the in-conversation card; base chips Missed and No reply |
| D10 | Meaning of "online" | websocket heartbeat lease | Socket-bound lease (§3.2) |
| D11 | Manual availability status | Yes | Not in this plan |

---

## 5. Phases (P1 → P2 → P3 → P4 → P5 → P6; P3 may ship before P2)

### P1 — Workspace realtime platform, presence lease, global calling UI (item 1)

**Design**
1. `apps/builder/src/features/realtime/` (channel-agnostic, no chat or WhatsApp imports):
   - `types.ts`
     - `type RealtimeEventName = (typeof RealtimeEventType)[keyof typeof RealtimeEventType]` (`RealtimeEventType` is a value
       object, `schemas.ts:3`);
     - `type RealtimeEvent<K extends RealtimeEventName> = Extract<RealtimeEventData, { eventType: K }>`;
     - `type RealtimeHandlerMap = { readonly [K in RealtimeEventName]?: (event: RealtimeEvent<K>) => void }`.
   - `realtime-event-validation.ts` — `REALTIME_EVENT_SCHEMAS: { readonly [K in RealtimeEventName]?: ZodType<RealtimeEvent<K>["data"]> }`
     built from the zod schemas that already exist in `partysocket-config` (the call events). Events without a schema keep
     `data: unknown` in their TS type today (e.g. `messageCreated`), so subscribers must narrow them — the provider never
     asserts a type it did not check.
   - `workspace-realtime-provider.tsx` — owns the one `usePartySocket` (token minting moved unchanged from
     `chat-realtime.tsx:61-76`), keeps `Map<RealtimeEventName, Set<RealtimeListener>>`, `JSON.parse` in try/catch, looks up
     listeners by `eventType`, validates with `REALTIME_EVENT_SCHEMAS[eventType]` when present, dispatches. Malformed JSON or a
     failed schema → `logger.warn` (rate-limited); an `eventType` with no listener or unknown to this build → ignored at debug
     level (forward compatible across staggered deploys, no warning spam).
   - `use-workspace-realtime-events.ts` — `useWorkspaceRealtimeEvents(handlers: RealtimeHandlerMap)`: one stable wrapper per key,
     latest handlers held in a ref (no reconnect, no stale closure, Strict-Mode safe), unregister on unmount.
   - `use-workspace-realtime-status.ts` — `connecting | open | closed` + `reconnectCount` (increments only after a previous open).
   - `use-workspace-presence.ts` + `actions/heartbeat-workspace-presence.action.ts` + `actions/sign-off-workspace-presence.action.ts`
     (§3.2), `app/api/workspace-presence/sign-off/route.ts` for `pagehide` via `navigator.sendBeacon` (same-site + auth + member
     checks reused from `app/api/whatsapp-voip-call-hangup/route.ts`).
2. **Gate contract** (computed once in `app/space/[workspaceId]/layout.tsx`, inputs at :71-171, passed as props):
   - `realtimeEnabled = true` for any resolved workspace access — the platform is authenticated by the existing token endpoint and
     is not tied to a feature permission; each feature gates its own subscription/UI;
   - `callingEnabled = hasContactsAccess(permissions) && !isSupportSession && !scheduledForDeletion && !(cloud && blocked)` (D8);
   - `callHistoryEnabled = hasContactsAccess(permissions) || hasWorkspacePermission(permissions, "analytics")` (D4).
3. **Chat becomes a subscriber** with exactly the chat events `ChatRealtime` handles today (`chat-realtime.tsx:83-137`):
   `messageCreated` (incl. the permission-reply invalidation of the outbound-call-mode query), `messageDeleted`,
   `messageIdAssigned`, `messageFailed`, `messageUpdated`, `messageContentUpdated`, `contactBlocked`, `contactUnblocked`,
   `conversationAssigned`. Logic moved, not rewritten; no event added or removed. Bubble-to-top on ringing becomes a zustand
   subscription to `ringingCalls` inside `ChatRealtime` (inbox only), removing `useChatStore` from `useWhatsappVoipCall`
   (`use-whatsapp-voip-call.ts:206,280`).
4. **Calling becomes a subscriber**: `integration-whatsapp/calling/voip/whatsapp-call-realtime.tsx`, a `RealtimeHandlerMap` for the six
   call events now at `chat-realtime.tsx:138-216`, voip store only.
5. **Presence service (refine, generalize):** `voip-presence-service.ts` → `packages/business/src/workspace-presence/service.ts`
   (`workspacePresenceService.heartbeat({ workspaceId, userId, tabId }) / signOff(...) / listOnlineMembers(workspaceId)`) over the
   existing `presenceStore`, key `workspace:presence:<workspaceId>` (§3.2). Callers updated: the moved action and `voip-call-service.ts`.
   `use-whatsapp-voip-presence.ts` and `heartbeat-voip-presence.action.ts` are deleted.
6. **Move** `WhatsappVoipCallProvider`, `WhatsappCallPanel` and the call subscriber under `callingEnabled`; `WhatsappCallInfoSheet`
   under `callHistoryEnabled`; presence under `realtimeEnabled`. Strict `useWhatsappVoipCallContext` callers (verified three): the panel
   keeps it; `conversation-item.tsx:169` and `whatsapp-voip-call-button.tsx:145` switch to `useOptionalWhatsappVoipCallContext()` →
   `null` renders no ringing overlay and no call button.

**Behaviour preservation:** the inbox receives exactly the events it receives today, once; token minting, reconnect, call flows and
bubble-to-top unchanged; `chat-realtime.test.tsx`, `use-whatsapp-voip-call.test.tsx`, `whatsapp-voip-call-context.test.tsx` stay green.

**Load:** one socket per tab (was per inbox tab); one presence request / 20 s per open tab while connected.

**Tests:** dispatch once per subscriber; multiple subscribers per event; unsubscribe on unmount; handler identity change does not reconnect;
malformed JSON logged; schema failure logged and not dispatched; unknown event ignored; `reconnectCount` only after re-open; chat subscriber
parity for the nine chat events; call subscriber parity for the six call events without `ChatStoreProvider`; bubble-to-top on ringing in inbox;
active call survives route change; optional context `null` → no overlay/button; presence: heartbeat only while open, immediate on open and
on reconnect, per-tab sign-off leaves the other tab online, `listOnlineMembers` dedupe/order/scan limit, legacy key appended, action rejects
non-UUID tabId, beacon route 401/403/200; gate matrix (any member, contacts, onlyAssigned, analytics-only, support session, scheduled
deletion, blocked).

### P2 — Ring the right online agents; only they may pick up (item 2)

**Design**
1. `packages/business/src/whatsapp-call/ring-targets.ts` (pure, no I/O):
   ```ts
   export type RingTierName = "assignee" | "assignedTeam" | "eligibleOnline"
   type RingTier = { readonly name: RingTierName; readonly resolve: (context: RingContext) => readonly string[] }
   export const RING_TIERS = [assigneeTier, assignedTeamTier, eligibleOnlineTier] as const satisfies readonly RingTier[]
   export const CALL_ELIGIBILITY_RULES = [isSuperAdmin, hasContactsPermission, isIndividuallyAssignedOnlyMember] as const
   export function isEligibleForConversationCall(member: RingMember, conversation: RingConversation): boolean // rules.some
   export function selectRingTargets(context: RingContext): { tier: RingTierName | null; userIds: readonly string[] }
   ```
   Tiers receive presence-ordered online user ids; each filters through the single predicate; first non-empty tier wins; cap
   `MAX_VOIP_RING_TARGETS` applied last. `onlyAssignedContacts` means **individually** assigned (existing contact scope,
   `features/contacts/permissions.ts:27-38`): a team member with only that permission is not eligible for a team-assigned
   conversation and is not rung in tier 2 (resolves the D2/D3 interaction explicitly).
2. **Split `resolveRingTargets` (refine, not replace)** into `reserveIncomingCall({ wacid, deadlineAt })` — today's `setIfAbsent` /
   `alreadyProgressed` / still-`reserved` branches (`voip-call-service.ts:251-298`) — and worker-side selection, so the deadline-owning
   control exists before any retryable read.
3. **New bounded projections (repositories, Drizzle `inArray`/`eq`):**
   - `workspaceMemberRepository.listPermissionsByUserIds({ workspaceId, userIds })` → `{ userId, permissions }[]` — the existing cached
     `workspaceMemberService.listByWorkspaceId` loads the whole roster (`workspace-member/service.ts:221`) and the single-user read is uncached;
   - `inboxTeamMemberRepository.listUserIdsByTeamId({ workspaceId, inboxTeamId })` → `string[]` — the cached `listByWorkspace` loads every
     team with members and users (`enterprise/inbox-team/service.ts:29-47`), too heavy per inbound call.
   Both exposed through their business services (`workspaceMemberService`, `inboxTeamService`). Each new repository follows the existing
   layout: `repositories/<domain>/repository.ts` + `repositories/<domain>/index.ts`, exported from `repositories/index.ts`
   (pattern: `repositories/whatsapp-call/index.ts:1`, `repositories/index.ts:50`).
4. **`handleConnect` order:** terminal-row guard → `resolveVoipIntegration` → `inboundCallRefusal` (uncommitted gate, extended in step 6) →
   `readOffer` → **`reserveIncomingCall`** → `getCallRowOrThrow` (retry safe) → snapshot (conversation via `conversationService`;
   `workspacePresenceService.listOnlineMembers`; permissions projection for those ids; team projection only when `assignedInboxTeamId`) →
   `selectRingTargets` → empty ⇒ `endReservedCall` (Graph reject + finalize `rejected`, same observable result as today's `noEligibleAgent`)
   → `ringAgents` + existing post-delivery recheck. Redelivery while `reserved` re-runs selection; `alreadyProgressed` stays a no-op.
5. **One authorization service**, `packages/business/src/whatsapp-call/call-access-service.ts`, with a single core check and two thin
   entry points (no duplicated logic):
   - `assertCanCallConversation({ workspaceId, conversationId, userId })` — loads the conversation and the member's permissions **fresh,
     uncached**, applies `isEligibleForConversationCall`;
   - `assertCanHandleIncomingCall({ workspaceId, whatsappCallId, userId })` — loads the call, then delegates to `assertCanCallConversation`.
   Outbound callers (D3 applies to dialing too — an assigned-only agent must not dial or request permission on another agent's
   conversation): `initiate-outbound-voip-call` (before `createOutboundAttempt`), `resolve-outbound-call-mode`, `request-call-permission`.
   Incoming callers:
   - answer action: before claim, and again after a successful claim and before `pre_accept` (fresh reload catches reassignment or removal
     in between); failure → `releaseClaim`, return `cannotAnswer`;
   - resume: `get-pending-incoming-voip-call.action.ts` passes server-derived `ctx.user.id`; `listResumableIncoming({ workspaceId, userId })`
     filters candidates through the helper before returning any offer SDP;
   - `voip-turn-credentials.action.ts` for unclaimed calls.
   The incoming card's Reject stays a local dismissal (`use-whatsapp-voip-call.ts:971`); hangup, heartbeat and upload keep their owner
   checks. Update M6 in `docs/whatsapp-calling-voip.md`.
6. **Server-side D8 — already enforced, keep as is (VERIFY resolved):** the signaling worker wraps every job in `withBlockedOwnerGuard`
   before `handleConnect` runs (`apps/worker/src/integration/worker.ts:579-584`), and the guard returns without invoking the handler for a
   blocked owner and for a workspace scheduled for deletion (`packages/business/src/workspace-lifecycle/with-blocked-owner-guard.ts:25`).
   This is the project invariant #15 (AGENTS.md: blocked owner = safe no-op, no retry). No new refusal is added; nobody is rung and Meta ends
   the call on its own timeout, exactly as today. Support sessions have no member row, so they are never in the permissions projection.
7. **Server-side calling gates for builder actions (D8 for support sessions).** `workspaceActionClient` already rejects scheduled deletion
   and a blocked owner and puts `isSupportSession` and `workspaceMemberPermissions` in `ctx` (`apps/builder/src/lib/safe-action.ts:109-185`).
   Two reusable middlewares added to that file, composed with `.use()` (no per-action if-else):
   - `rejectSupportSession` — refuses `ctx.isSupportSession`;
   - `requireContactsAccess` — refuses members without `hasContactsAccess` (which already lets `superAdmin` through, `permission-routes.ts:30-35`).
   Clients: `callingActionClient = workspaceActionClient.use(rejectSupportSession).use(requireContactsAccess)` and
   `callingAdminActionClient = workspaceActionClient.use(rejectSupportSession)` (keeps each action's existing `assertWorkspaceSuperAdmin`, since a
   synthetic support membership carries `superAdmin`).
   Every calling server action (verified list, all on `workspaceActionClient` today) mapped explicitly:

   | Action | New client | Why |
   |---|---|---|
   | `initiate-outbound-voip-call`, `resolve-outbound-call-mode`, `request-call-permission`, `answer-voip-call`, `get-pending-incoming-voip-call`, `voip-turn-credentials`, `outbound-voip-turn-credentials` | `callingActionClient` | start or join a call |
   | `update-calling-settings`, `update-call-hours`, `fix-whatsapp-calls-subscription` | `callingAdminActionClient` | configure calling; super-admin check kept |
   | `hangup-voip-call`, `heartbeat-active-voip-call` | unchanged (`workspaceActionClient`) | not gated by `rejectSupportSession`; keeps today's behaviour, including today's refusal for a scheduled-deletion or blocked workspace (`safe-action.ts:154-182`) |
   | `features/messages/actions/get-call-recording-url`, `get-call-transcript`, `get-call-summary` | unchanged (`workspaceActionClientAllowExpired`) + P5 `assertCanReadCall(scope: "artifact")` | reads (D8: not call control) |
   | `features/messages/actions/generate-call-ai-summary` | unchanged (`workspaceActionClient`) + P5 `assertCanReadCall(scope: "artifact")` | derived read; paid mutation already blocked for expired/blocked owners by its client |
   | `features/messages/actions/list-call-summary-providers` | unchanged | lists the workspace's AI providers, carries no call data |
   | `heartbeat-voip-presence` | replaced by the P1 workspace presence actions (platform, not calling) | presence is not a calling permission |

   **Workspace frozen during an active call (existing behaviour, unchanged and documented):** the layout's `callingEnabled` becomes false on the
   next server render (e.g. `RefreshOnNavigation`'s visibility refresh), the calling layer unmounts and runs its existing unmount teardown
   (peer connection and microphone closed, `use-whatsapp-voip-call.ts:358,489`); the hangup action is refused by `workspaceActionClient`
   exactly as it is today, and Meta ends the now media-less call itself (`138021`/`138022`, `docs/whatsapp-calling-voip.md:218,366`).
   The resulting terminate webhook is **not** processed while the workspace stays frozen: the integration worker returns before dispatch
   (`apps/worker/src/integration/worker.ts:154-155` → `isBlockedWorkspace` → `withBlockedOwnerGuard`), per invariant #15. The row therefore stays
   `accepted` — this is today's behaviour and the plan does not change it. It is recovered by the existing path when the workspace is usable again
   (`recoverStrandedAccepted` on the next dial to that contact, `voip-call-service.ts:785`) or removed by workspace purge. Consequence for P5: such a
   row lists as `ongoing` until recovered (documented known limitation). No call is left with UI but no way to end it on the customer side.
   Routes: the hangup beacon keeps its current checks; the recording-upload route keeps its existing
   same-site, session, answered-agent and owner-access checks (it already denies blocked / deletion-scheduled owners,
   `app/api/whatsapp-call-recording/route.ts:110`), no calling gate added.
8. **Reassignment while ringing:** the call subscriber handles `conversationAssigned` and drops basket entries whose conversation is now
   assigned to another user (the reference client drops ringing entries on reassignment the same way, §2.2).

**Behaviour preservation:** refusal gate, offer handling, CAS claim/commit/release, expiry, post-delivery recheck and end-outcome table
unchanged; existing `whatsapp-voip-signaling.test.ts` cases stay green with the new order.

**Load:** per inbound connect: one presence read, one permissions read bounded by online ids, 0/1 team read by id, one conversation read.

**Tests:** tier matrix (assignee online+eligible / online+ineligible / offline → team / team member with only onlyAssignedContacts skipped /
team empty → eligible online / nobody), cap applied after eligibility, ordering; predicate table for every permission combination;
projections return only requested ids and are workspace-scoped; handleConnect: reserve before row, row retry keeps control, empty selection
ends reserved call with reject, redelivery re-selects, alreadyProgressed no-op, blocked/scheduled-deletion workspace still never reaches
`handleConnect` (guard test kept); answer refused before claim;
refused after claim on reassignment/removal with release; resume filtered per requester and never leaks SDP; TURN refused for ineligible;
reassignment drops ringing; support-session user never targeted; outbound D3: assigned-only agent denied initiate / mode / permission request on a
conversation assigned to someone else or unassigned, allowed on their own; gate table: every `callingActionClient` / `callingAdminActionClient` row rejects a support session, the
`callingActionClient` rows reject a member without contacts access, the admin rows still require super admin; hangup and active heartbeat keep
their current client behaviour (allowed normally, refused for a frozen workspace as today); frozen-during-call: provider unmount tears down the
peer and microphone (component test); integration-worker test that a `whatsappCallEvent` terminate job for a frozen workspace is a no-op and
leaves the row `accepted` (invariant #15, existing behaviour pinned); recovery on the next dial after unfreezing finalizes it `completed` with
`outcome: "completed"`; database-backed test that deleting a workspace cascades its `WhatsappCall` rows (FK `ON DELETE CASCADE`,
`schema/whatsapp-call.ts:135`), which the known limitation relies on.

### P3 — Auto-assign on answer and outbound dial (item 4)

**Design**
1. **Repository** (VERIFY resolved: `updateAssignment` writes Drizzle directly in the service, `conversation/service.ts:896-905`; the new
   write follows the data-access rule instead): new `packages/database/src/repositories/conversation/` (`repository.ts` + `index.ts`,
   exported from `repositories/index.ts`) with
   `assignUserIfUnassigned({ workspaceId, conversationId, userId })` →
   `update(conversationModel).set({ assignedUserId: userId }).where(and(eq(workspaceId), eq(id), isNull(assignedUserId), isNull(assignedInboxTeamId))).returning()`.
2. **Service** `conversationService.claimForCallAgent({ workspaceId, conversationId, userId, triggerHandler })`: calls the repository; when
   (and only when) a row is returned, calls `publishAssignmentChanges({ workspaceId, conversations: claimedRows, assignedUserId: userId,
   assignedInboxTeamId: null, assignedBy: userId, triggerContext })`, built **from the rows the UPDATE returned**, never from caller input.
   `publishAssignmentChanges` is extracted from `updateAssignment` (:906-973) and `updateAssignment` calls it with its own returned rows —
   same order: invalidate → `conversationUpdated` → `conversationAssigned` → notification unless self → `emitConversationAssigned` →
   analytics. Trigger context like `assignOne` (:804-834): `{ triggerSource: "api", triggerHandler }`, service sets
   `triggerType: "conversation_assigned"`.
3. `CALL_ASSIGNMENT_TRIGGER_HANDLERS = { answered: "whatsappCallAnswered", dialed: "whatsappCallDialed" } as const`.
4. Call sites: answer action after `markAcceptedByAgent` returns true (~:373); outbound action after the post-connect try/catch (~:481).
   Wrapped: failure logged with `err`, never fails the call.

**Behaviour preservation:** `updateAssignment` observable behaviour identical (existing conversation service tests); no call fails because of
assignment.

**Tests:** claims unassigned; skips user-assigned; skips team-assigned; concurrent manual assignment wins → no publish; publisher uses returned
rows only; self-assign sends no notification but emits the trigger; `updateAssignment` still publishes for its rows; answer/dial invoke only on
success; assignment error does not change the call outcome.

### P4 — More call entry points (item 5)

**Design**
1. `voip/use-whatsapp-call-starter.tsx` — extracted from `whatsapp-voip-call-button.tsx` (mode, permission dialog, manual
   warning, outcome → alert map, `startOutbound`); used by the header, the card and the contact panel.
2. `resolveOutboundCallModeAction` input `{ conversationId, contactInboxId? }` (ownership check reused from
   `outbound-dial-target.ts:43-49`). `outbound-call-mode-query-key.ts` becomes a key factory
   `outboundCallModeQueryKeys = { conversation(workspaceId, conversationId), detail(workspaceId, conversationId, contactInboxId) }`
   (`detail` extends `conversation`); every invalidation (after P1: chat subscriber `messageCreated`, call subscriber
   `whatsappCallPermissionUpdated`) uses `conversation(...)` so all number variants refresh and no caller builds keys by hand.
3. **Call back** on `WhatsappCallCard`: visible when
   `CALL_BACK_STATUSES_BY_DIRECTION = { userInitiated: new Set(["failed", "rejected"]), businessInitiated: new Set() }` contains the entity
   status for its direction — every non-completed inbound call (matches the reference call-back rule in §2.2), expressed on direction + status rather than label names;
   disabled while the call slot or ringing basket is non-empty. `message-item.tsx` passes `conversationId`, `contactInboxId`.
4. **Contact panel** button in `contact-detail.tsx`: options = WhatsApp entries of `conversation.contactInboxes` (resource
   includes `inbox.name`); one → dial, several → picker. Only existing contactInboxes (dialing requires one).
5. **Go to conversation** in `whatsapp-call-panel.tsx`, and D6 after answering: `router.push` when off the inbox; on the
   inbox a chat-store action `openConversation(id)` that fetches when not loaded (generalizes
   `initActiveConversationFromUrl`, `chat-store.ts:215-270`).

**Behaviour preservation:** header button behaviour and tests unchanged; mode query identical when `contactInboxId` is omitted.

**Tests:** starter hook outcome-map parity; call-back visibility for inbound failed/rejected and hidden for outbound failed/canceled and
completed, disabled states; contact panel with
0/1/n WhatsApp numbers; mode action rejects a foreign contactInbox; prefix invalidation refreshes all variants; panel link
on/off inbox; navigation after answer; `openConversation` loaded / not loaded.

### P5 — Calls page (item 3)

**Design**
1. **Migration** (generate, inspect, **apply only with approval**), split into TWO migrations for lock safety (review A1 — one
   transactional migration bundling `DROP INDEX` + `ADD COLUMN` + two full-table `UPDATE`s + a non-`CONCURRENTLY` `CREATE INDEX`
   would hold ACCESS EXCLUSIVE on `WhatsappCall` for the whole backfill/build, blocking every live call webhook/read):
   1. `20260917173244_whatsapp_call_outcome_type_column` — transactional, `SET LOCAL lock_timeout` (precedent:
      `20260712170535_contact_filter_w1_last_sent_index`), `whatsappCallOutcome` pgEnum (`completed|failed|rejected|canceled`) +
      nullable `outcome` column + zod mirror in `partials/whatsapp-call.ts`.
   2. `20260917173245_whatsapp_call_outcome_backfill_index` — every statement uses `CONCURRENTLY` or is itself idempotent, so the
      runner (`scripts/run-migrations.mjs`) executes it unwrapped (precedent: `20260903024507_error_log_indexes`,
      `20260905151444_add_contact_email_phone_workspace_indexes`): backfill terminal rows in two ordered, `"outcome" IS NULL`-guarded
      statements — `outcome = 'canceled'` where `status = 'failed' AND lastError = 'canceled_by_business'` (the persisted cancel
      marker, `end-voip-call-as-agent.ts:89-98`), then `outcome = status` for remaining terminal rows; then composite index
      `(workspaceId, createdAt desc, id desc)` for cursor paging via `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, created BEFORE
      `DROP INDEX CONCURRENTLY IF EXISTS "WhatsappCall_workspaceId_createdAt_idx"` so the call-log query always has a covering
      index mid-migration.
   `initiatedByUser` relation added to `relations/whatsapp-call.ts` (the column `initiatedByUserId` exists, the relation does not).

   **Rolling-deploy contract (review A2):** the migration must land before the new outcome-writing pods roll out, but old pods
   still running during that window write terminal rows (sweep, no-wacid cancel, outbound connect/setup failures) with `outcome`
   left `NULL` — those never get a redelivery that would heal them via `fillMissingTerminalFields`. Every reader of `outcome`
   (P5b's `CALL_KIND_RULES` / `whatsappCallHistoryService.list` filters, and any other future reader) MUST treat `NULL` as
   "use `status` instead" — `coalesce(outcome, status)` semantics, not a plain `outcome` read. See
   `docs/whatsapp-calling-voip.md`'s "Call outcome column" section.
2. **Outcome follows status, under the existing transition guard** (review #4: fill-once conflicts with the deliberate `failed → rejected`
   repair, `repository.ts:94-128`):
   - pure `resolveWhatsappCallOutcome({ status, canceledByBusiness })` — `OUTCOME_BY_TERMINAL_STATUS` map plus the canceled override;
   - **terminal-only finalize contract:** `finalizeById` has one caller, `whatsappVoipCallService.finalizeEndedCall`
     (`voip-call-service.ts:909`), and every finalizer passes a terminal status (verified callers in §2.1). Both inputs are narrowed to
     `status: WhatsappCallTerminalStatus` with a status-compatible `outcome` type
     (`OUTCOME_BY_FINAL_STATUS`: `failed → "failed" | "canceled"`, `rejected → "rejected"`, `completed → "completed"`), so a non-terminal
     finalize or a mismatched pair is a type error;
   - **every repository write of a terminal `status` writes `outcome` in the same UPDATE**:
     - `finalizeById`: on status advance, `outcome` is set from its input; on a same-status redelivery `outcome` is filled only when null
       (added to `FILLABLE_TERMINAL_FIELDS`, `repository.ts:36`), so a later `failed` webhook cannot turn `canceled` into `failed`;
     - `updateInterimStatus` (accepts `ringing` and `rejected` today, `repository.ts:723`): its input becomes a discriminated union
       `{ status: "ringing" } | { status: "rejected" }` and the repository sets `outcome` from `OUTCOME_BY_TERMINAL_STATUS` only on the
       terminal branch — no caller fabricates an outcome for `ringing`; a `failed → rejected` repair (allowed by `canAdvanceStatus`,
       `repository.ts:119`) therefore rewrites both columns together;
     - `recoverStrandedAccepted`: sets `outcome = 'completed'` with `status`.
   - `outcome` is a required field of `finalizeById` / `finalizeEndedCall` inputs, so an omitted finalizer is a type error. Each concrete
     writer, using one pure helper `resolveWhatsappCallOutcome({ status, canceledByBusiness })` so the cancel rule lives in one place:
     | Writer | `status` | `outcome` |
     |---|---|---|
     | `finalizeCallSideEffects` (`whatsapp-call-finalize.ts:326-351`) | `toPersistedCallStatus(entity.status)` | `entity.status` taken **before** the collapse, so a `canceled` entity persists `outcome: "canceled"` |
     | `endVoipCallAsAgent`, no-wacid branch (`end-voip-call-as-agent.ts:89-98`) | `failed` | `canceledByBusiness = isBusinessCancelBeforeAnswer` |
     | `endVoipCallAsAgent`, wacid branch (`end-voip-call-as-agent.ts:143-155`) | `ended.terminalStatus` | `canceledByBusiness = isBusinessCancelBeforeAnswer && ended.terminalStatus === "failed"` (the same condition that writes the marker today) |
     | outbound connect / setup failures (`initiate-outbound-voip-call.action.ts:396,468`) | `failed` | `failed` |
     | stale sweep (`sweep-stale-whatsapp-calls.ts:82`) | `failed` | `failed` |
     | signaling wrapper (`whatsapp-voip-signaling.ts:210-229`) | its `failed \| rejected` | same as status |
     | `updateInterimStatus` terminal branch (`repository.ts:723`, caller `whatsapp-call.ts:473`) | `rejected` (from `ringing`, or `failed → rejected` repair) | `rejected`, set inside the repository from `OUTCOME_BY_FINAL_STATUS`; the `ringing` branch writes no outcome |
     | `recoverStrandedAccepted` (`repository.ts:846`, caller `voip-call-service.ts:785`) | `completed` (from `accepted`) | `completed`, same UPDATE |
3. **Call access** (same service file as P2) — two named scopes in one object so list and artifacts can never drift:
   ```ts
   export const CALL_READ_SCOPES = {
     history: { allCalls: isCallHistoryAdmin, row: (member, call, conversation) => isOwnCall(member, call) && isEligibleForConversationCall(member, conversation) },
     artifact: { allCalls: isCallHistoryAdmin, row: (member, _call, conversation) => isEligibleForConversationCall(member, conversation) },
   } as const
   ```
   `isCallHistoryAdmin = superAdmin || analytics`; `isOwnCall = answeredByUserId === userId || initiatedByUserId === userId`.
   `history` becomes the list where-builder input (translated to Drizzle conditions, not evaluated in memory); `artifact` guards the four
   artifact actions through `assertCanReadCall({ workspaceId, whatsappCallId, userId, scope: "artifact" })`. The `artifact` scope keeps today's
   in-conversation behaviour for everyone who can see the conversation (matches the reference model, where recordings are treated as conversation attachments) and removes
   access for members who cannot see it (today they can, since these actions check membership only).
4. **Repository** `whatsappCallRepository.listForWorkspace({ workspaceId, scope, filters, cursor, limit })` following the where-builder
   pattern (`repositories/appointment/repository.ts:55-70`): joins `whatsappCall` → contactInbox → contact, inbox, answeredBy/initiatedBy
   users, conversation (for D3) — **never the sharded Message hypertable** (`WhatsappCall.messageId` has no FK by design,
   `schema/whatsapp-call.ts:78`, `schema/message.ts:60`). **Cursor pagination** `(createdAt, id)` with the existing helpers
   (`lib/pagination/index.ts:43-99`, used by the conversation list), page size 25 (matches the reference page size, §2.2), **no exact total count** — an
   unbounded filtered `COUNT(*)` per view is the expensive part at scale; the UI shows "Load more" instead of page numbers and chips without
   counts (documented deviation from the reference implementation's numbered pages). **VERIFY** with `EXPLAIN (ANALYZE, BUFFERS)` on a seeded dataset for every
   supported filter combination (none, each activity chip, direction/status/outcome, inbox, agent, D3 scope, and their combinations with the
   cursor); add composite indexes only for combinations the plans show scanning beyond the page, and record the plans in the PR.
5. **Service** `whatsappCallHistoryService.list` with `CALL_KIND_RULES` — ordered `{ kind, matches(row) }[]` over
   `status`/`outcome`/`direction` (ongoing, canceled, declined, missed, unanswered, answeredInbound, answeredOutbound; first match) —
   and `CALL_ACTIVITY_FILTERS`, an object mapping each chip to a typed filter consumed by the where-builder (mirrors the reference implementation's activity-chip parameter map).
6. **UI:** `app/space/[workspaceId]/calls/page.tsx` (server component + nuqs), `features/whatsapp-calls/` query adapter, table, filter bar,
   row (`CallAudioPlayer`, info sheet, conversation link), empty state; sidebar item gated by `callHistoryEnabled`; i18n in all 20 locales.

**Behaviour preservation:** status transitions unchanged (outcome only rides along); card labels unchanged; artifact actions keep working for
everyone who can see the conversation.

**Load:** one keyset-paginated query per page view (`LIMIT 26`), no count, no per-row queries; index coverage per filter combination
confirmed by the EXPLAIN step; recording URL resolved lazily on play.

**Tests:** backfill (canceled marker, other terminal rows, non-terminal untouched); each writer sets the right outcome; transition matrix
(`finalizeById` status advance and same-status paths, `repository.ts:878-945`):
- status advance `ringing|accepted → failed|rejected|completed` sets `outcome` from input;
- permitted terminal-to-terminal advances (`canAdvanceStatus`, `repository.ts:119`): `rejected → failed`, `rejected → completed`,
  `failed → completed` rewrite `outcome` from input; a disallowed downgrade (e.g. `completed → failed`) leaves both columns unchanged;
- type-level: finalize with a non-terminal status or a mismatched status/outcome pair does not compile (type test);
- same-status redelivery with `outcome` null fills it; with `outcome` non-null (`canceled`) keeps it;
- canceled (`failed` + `canceled`) then same-status `failed` webhook keeps `canceled`;
- `failed`(`failed`) then `rejected` repair rewrites to `rejected`; `failed`(`canceled`) then `rejected` repair rewrites to `rejected`;
- interim `ringing → rejected` sets `rejected`; interim `ringing` leaves `outcome` null;
- stranded `accepted → completed` sets `completed`; delayed terminal delivery after recovery does not downgrade status or outcome;
- stale sweep sets `failed`;
- per writer: shared finalizer with a `canceled` entity persists `canceled`; both `endVoipCallAsAgent` branches persist `canceled` for an
  outbound cancel before answer and `failed`/`completed` otherwise; outbound failure paths and signaling wrapper persist their status; kind rules table; chip filter map; cursor next/end/stable ordering on equal
`createdAt`; history scope matrix (superAdmin, analytics-only, contacts agent own answered / own initiated / others', onlyAssigned own in
assigned vs unassigned conversation); agent filter ignored for non-privileged; artifact scope matrix (superAdmin, analytics-only, contacts agent
any call, onlyAssigned assigned vs not, member without contacts/analytics denied) applied in each of the four artifact actions; support session
can read history and artifacts; expired workspace can still read through the allow-expired client; empty state; component render.

### P6 — Small items (item 7)

1. **beforeunload** in the calling layer when the phase is in
   `LEAVE_CONFIRMATION_PHASES = new Set([answering, outboundDialing, outboundRinging, active])` or the basket is non-empty;
   `pagehide` beacon unchanged.
2. **Preview:** `resolveLastMessagePreview` uses the existing `getWhatsappCallEntity` type guard (`packages/sdk/src/lib/shared/message.ts:314`).
   For a call entity: non-completed → `resolveWhatsappCallActivityLabelKey` label (it deliberately excludes completed, :342); completed →
   the existing `messages.voiceCall` key ("Voice call"), or `messages.voiceCallDuration` ("Voice call · {duration}") when `durationSeconds`
   is present (both verified in `messages/en.json:3487-3488`). Any other message keeps the current `message.text` /
   attachment fallback. `conversation-item.tsx` picks the icon from `CALL_PREVIEW_ICON_BY_KIND` (`completedInbound`, `completedOutbound`,
   and the four label keys).
3. **Preset — CANCELLED (see §9 review log, Fable review on P5 item 6 + P6 items 1–2):** the owner decided not to implement
   this item. The plan below is kept for record only and must not be picked up without a new, separate approval. ~~P6.3a spike
   with its own approval — trace every completion path through `applyConnectIntent` (embedded, manual, fan-out, verification,
   coexist) and where the integration id is known; P6.3b — channel card plus non-blocking enable that reuses
   `updateWhatsappCallingSettingsAction` logic and `ensureWhatsappCallsWebhookSubscribed`.~~

**Tests:** beforeunload per phase and basket; preview per label key, completed with and without duration, both directions, non-call messages
unchanged; preset enable success,
failure toast, not triggered without the intent.

---

## 6. Cross-cutting

### 6.1 TDD workflow (mandatory for every phase)
Each phase is implemented test-first, in small slices (one design item at a time), following `.agents/skills/testing-workflow/SKILL.md`
and the `tdd` skill:
1. **RED** — write the tests for the slice from that phase's test list (unit for pure rules/maps, integration for services/repositories/
   worker handlers, component tests for UI); run them and confirm they fail for the expected reason (not an import/typo error).
2. **GREEN** — write the minimal implementation to pass; run the affected suite.
3. **REFACTOR** — clean up (maps/strategies, naming, no duplication) with tests still green.
4. **Regression** — run the full suites of every touched workspace (the existing tests listed under "Behaviour preservation" must stay green).
5. **Coverage** — keep the 80% threshold (`packages/vitest-config/src/node.ts`); never set `VITEST_SKIP_COVERAGE_THRESHOLDS`.
6. **Gate** — `pnpm lint`, `check-types` for touched workspaces, then a Codex adversarial review of the phase diff before commit.
Slices that only move code (e.g. P1 chat handlers, P3 publisher extraction) start by **pinning current behaviour** with characterization tests
that pass before the move and must still pass after it.
- Skills read before each phase (§1). Gate per phase: `pnpm lint`, `check-types` for touched workspaces, affected Vitest
  suites, Codex adversarial review before commit.
- Docs: `whatsapp-calling-voip.md` (realtime platform, presence lease, tiers, M6, outcome), `whatsapp-calling.md` (Calls page,
  preset), new `docs/realtime.md` (how a feature subscribes; never open a workspace socket).

## 7. Risks
| Risk | Mitigation |
|---|---|
| Room connection limit after global socket | §3.3 load test; `hibernate: true` if needed |
| Rolling deploy across the presence key rename | Legacy key appended for one release |
| Multi-tab presence | Per-tab members, per-tab sign-off (§3.2) |
| Calls list cost at scale | Cursor pagination, no count, EXPLAIN-verified indexes |
| Chat regressions from the socket move | Handler maps moved verbatim + parity tests |
| `handleConnect` reordering | Reserve-first; existing signaling tests + new ordering tests |
| Migration chain conflict with in-flight work | §2.3 prerequisite |

## 8. Complexity
P1 High · P2 Medium · P3 Low · P4 Medium · P5 High · P6 Low–Medium.

## 9. Review log
- v1–v4: three Codex adversarial reviews. Resolved: expiry no-op before control → reserve-first; TOCTOU → re-check after
  claim; outcome on one path only → required at the finalization API; artifact reads workspace-only → shared read scope;
  analytics-only contradiction → D4 audience first; strict vs optional call context; info-sheet gate; invalidation sites.
- v5: owner feedback — general realtime platform; presence tied to realtime.
- v6: presence re-evaluated against PartyKit docs, the deployment and an independent Codex analysis → socket-bound lease;
  code-quality contract applied to every phase.
- Codex review #4 (on v6) → v7: `RealtimeEventName` type; exact chat event list (9 events); validation via existing zod schemas, unknown events
  ignored; platform socket not gated by contacts permission; option (c) rejection re-grounded (miniflare/workerd vs ioredis); **per-tab presence
  members + per-tab sign-off**, dedupe + scan limit, cap after eligibility; resume passes requester identity; post-claim check reloads fresh data;
  bounded permission/team projections; `onlyAssignedContacts` = individually assigned; server-side D8 refusal (verified absent today);
  conditional assignment in a repository, publisher uses returned rows; query-key factory; call-back rule on direction+status;
  **outcome follows status under `canAdvanceStatus`, written by every terminal writer incl. `updateInterimStatus`/`recoverStrandedAccepted`**,
  backfill maps the cancel marker; no Message join; cursor pagination without count; preview via `getWhatsappCallEntity`.
- Codex review #5 (on v7) → v8: D8 server-side is already enforced by `withBlockedOwnerGuard` before `handleConnect` (invariant #15) → no new
  refusal; `updateInterimStatus` input made a discriminated union so only terminal writes carry outcome; legacy presence read bounded and merged
  list capped; repository `index.ts` + `repositories/index.ts` exports specified; full outcome transition test matrix; EXPLAIN for every filter
  combination; precise workerd wording; completed-call preview specified.
- Codex review #6 (on v8) → v9: D4 split into two named read scopes (history = own AND D3; artifact = D3, preserving the in-conversation card);
  server-side calling gate `callingActionClient` for support sessions on every calling action except hangup/heartbeat/upload; full `finalizeById`
  outcome matrix incl. same-status fill/keep and canceled→rejected repair; preview ground truth corrected.
- Codex review #7 (on v9) → v10: D3 enforced for outbound (initiate, mode, permission request) via one `assertCanCallConversation` core
  shared with incoming; complete action → client table incl. settings / hours / subscription repair behind `rejectSupportSession`; terminal-only
  `finalizeById` contract with status-compatible outcome types; matrix adds terminal-to-terminal advances, disallowed downgrade and type tests;
  safe-action line refs corrected; recording upload wording corrected.
- Codex review #8 (on v10) → v11: D8 scope made precise (call control off; reads follow normal rules incl. support sessions, as for every other
  workspace record); the five message-side call actions added to the action table; per-writer outcome table with one
  `resolveWhatsappCallOutcome` helper and the canceled propagation for the shared finalizer and both hangup branches, with tests.
- Codex review #9 (on v11) → v12: per-writer outcome table completed with `updateInterimStatus` and `recoverStrandedAccepted`; D8 active-call
  contradiction removed — hangup/heartbeat keep today's client (incl. today's frozen-workspace refusal), and the frozen-during-call path is
  documented (client teardown, Meta ends the media-less call, worker webhook finalizes) with tests.
- Codex review #10 (on v12) → v13: writer table confirmed complete; frozen-during-call corrected — the terminate job is skipped by the integration
  worker guard, the row stays `accepted` (existing behaviour, invariant #15), recovered by `recoverStrandedAccepted` or purge; worker-level test
  and P5 known limitation added.
- Codex review #11 (on v13): **APPROVABLE**, no blocking issue; D5 wording aligned with P5 (rewrite on status advance, fill only on same-status
  redelivery); purge-cascade test added.
- P2 deviation (implementation, post-v13): `assertCanCallConversation`/`assertCanHandleIncomingCall` as named in earlier drafts of this plan
  were replaced by a non-throwing `canCallConversation` (+ `canCallConversationForMember`) in `packages/business`, with the translated throw
  moved to the action boundary (`assertCallAccessOrThrow` in `assert-call-access.ts`) — business code does not own i18n, so a D3 denial there
  is a plain boolean the action layer translates and throws.
- Fable review (on P4, implementation) → fixes applied: `WhatsappCallCard`'s inline-object `useChatStore` selector (zustand v5
  `useSyncExternalStore` infinite-loop risk) split into stable primitive selectors; the contact panel's 2+ number picker redesigned as a
  pure `DropdownMenu` selector with the starter/dialogs host mounted OUTSIDE the popup (`ContactPanelCallEntry`, keyed by the committed
  selection) instead of one starter-per-row inside `DropdownMenuContent`; `useOutboundCallMode` gained an `enabled` option and `retry:
  false`; `WhatsappVoipCallProvider.answer()` now returns an `AnswerOutcome` and takes an `onAnswered` callback so D6 navigation is owned
  by the provider on BOTH the immediate-answer and replace-confirm paths (`WhatsappCallPanel`'s `handleAnswer` collapsed to one helper).
  **Deviation (verified against code, not fixed as a "bug"):** the "P4 item 3" comments' claim that the call-back control's
  `contactInboxId` "feeds ... the 'caller info' name shown in the box" is imprecise — `contactName` (the display name) and
  `whatsappContactInboxId` (the dial target) are two SEPARATE fields resolved from the SAME `findContactInboxByChannel(active, whatsapp)`
  lookup on the message's own conversation; the message entity itself (`MessageWhatsappCallEntity`) carries no `contactInboxId` field at
  all (by design — see `packages/sdk`), so this store-derived heuristic is the same one `message-head.tsx`'s header button already uses,
  not a shortcut invented for the call-back control specifically.
- Fable review (on P5 part B, Calls page, implementation) → fixes applied: **C1 CRITICAL** — `canReadCall` re-resolved the caller's member
  from `WorkspaceMember` via a bare `userId`, denying a platform support session (synthetic membership, no real `WorkspaceMember` row,
  invariant #19) for all four artifact actions; now takes the already-resolved `member: { userId, permissions }` the action layer already
  has via `ctx.user.id`/`ctx.workspaceMemberPermissions`, short-circuiting the `allCalls` (superAdmin/analytics) branch before any DB read.
  **H1** — the keyset cursor lost microsecond precision by round-tripping `createdAt` through a JS `Date`; fixed by carrying the DB's own
  `::text` rendering as the cursor (`WhatsappCallListCursor.createdAt: string`) and comparing with a parameterised `::timestamptz`-cast bound
  value — the `(workspaceId, createdAt desc, id desc)` index from the unapplied migration is unchanged. **M4** — the `ctx.userId` added to
  `workspaceActionClientAllowExpired` was dropped; every consumer (the four artifact actions, `listWhatsappCallsAction`) reads `ctx.user.id`
  (already present via next-safe-action's ctx deep-merge across the middleware chain) instead. **L1** — an explicit `direction` filter no
  longer overrides an active chip's own direction (chip wins). **L2** — a member with none of the four scope-granting permissions now fails
  closed (empty result, no repository read) instead of falling back to the most-restrictive real scope. **M1** — the activity chip change
  now goes through `nuqs`'s `useQueryState` (`shallow: false`), and `CallsPageClient` is keyed by `activity` in `page.tsx` so a filter change
  resets its `rows`/`nextCursor` state, replacing a raw `window.location.assign`. **M2** — an undecodable-but-provided cursor now throws
  `InvalidWhatsappCallCursorError` from the query adapter instead of silently restarting at page 1; "Load more" gained a translated
  `onError` toast. **M3** — `resolveCallRecordingUrl` (copied three times across `calls-table.tsx`, `whatsapp-call-card.tsx`,
  `whatsapp-call-info-sheet.tsx`) collapsed into one `createResolveCallRecordingUrl` in `features/messages/lib/`; `CallKindBadge`'s `if`-chain
  replaced with a `Record<CallKind, …>` whose four terminal-kind label keys are tied to the SDK's `WhatsappCallActivityLabelKey` via
  `satisfies` (structural parity with the in-conversation card, not a coincidental second copy). **L3** — the info button's `aria-label`
  changed from `t("title")` ("Calls") to a new `callInformation` key; the filter chips became plain toggle buttons with `aria-pressed`
  (were `role="tablist"`/`"tab"` with no owning `tabpanel`); `CallsEmptyState` now takes `hasActiveFilter` and renders distinct
  `emptyFilteredTitle`/`emptyFilteredDescription` copy instead of reusing "no calls yet"; the date column now uses `next-intl`'s
  `useFormatter().dateTime` instead of `date-fns`'s `format` (locale-aware, consistent with the rest of the app). **L4** —
  `CALL_ACTIVITY_CHIPS` changed from a bare `as const` to `as const satisfies readonly WhatsappCallActivityChip[]`, which let the one
  remaining `activity as WhatsappCallActivityChip | undefined` cast (`list-whatsapp-calls.query.ts`) be dropped — the type now flows
  structurally.
  **M5 (agent/inbox selects) — RESOLVED (follow-up pass):** the plan's item 6 agent select (admin-only) and inbox select are now
  implemented end-to-end. `inboxId`/`agentUserId` flow through `schema/query.ts` (`inboxIdQueryParser`/`agentUserIdQueryParser`,
  `listWhatsappCallsSearchParamsCache`, `listWhatsappCallsRequest`) → `listWhatsappCallsAction` → `listWhatsappCalls` query adapter →
  `whatsappCallHistoryService.list` (already accepted both — only the UI/URL/action wiring was missing). `CallsFilterBar` renders two
  `Select`s (mirrors `AdsAccountFilter`'s URL-driven pattern) with an `""` sentinel for "all"; the agent select renders only when
  `showAgentFilter` (`isCallHistoryAdmin(permissions)`, resolved server-side in `page.tsx` and threaded down through
  `CallsPageClient`) is true. Options come from a new session-free read, `queries/list-call-filter-options.query.ts`
  (`listCallFilterOptions`): inboxes narrowed to the `whatsapp` channel via `inboxService.listWithIntegrationsByWorkspace`, agents via
  `workspaceMemberService.listByWorkspaceId` — the latter skipped entirely (`includeAgents: false`) for a non-admin caller. Selecting
  either filter goes through the same `nuqs` `shallow: false` navigation as the activity chip (`CallsPageClient`'s
  `useQueryState("inboxId"/"agentUserId", …)`), so `page.tsx` re-runs server-side for a fresh page 1; `CallsPageClient`'s `key` in
  `page.tsx` now composes activity + inboxId + agentUserId (was activity-only) so ANY filter change resets the "Load more"
  cursor/`rows` state, and "Load more" itself now forwards the current `inboxId`/`agentUserId` alongside `activity`/`cursor` so a
  subsequent page keeps the active filters. The `allInboxes`/`allAgents` i18n keys removed in the prior pass are restored with real
  translations in all 20 locales. Tests: URL-param forwarding (query/action), agent-select visibility (admin vs non-admin), filter
  selection triggering the nuqs setters, Load-more forwarding, and page-level admin gating / options wiring.
  Same pass, two residual LOWs closed: `InvalidWhatsappCallCursorError` (`list-whatsapp-calls.query.ts`) now extends `ChatbotXException`
  (`code: "invalidCursor"`, `httpStatusCode: 400`) instead of a bare `Error`, so `actionClient.handleServerError` warn-logs a tampered
  cursor and returns a translated 4xx instead of falling through to the generic 5xx path — the "Load more" toast is unaffected.
  `CallsTable`'s `KIND_BADGE_CONFIG` no longer hand-types the four terminal kinds' label keys as string literals; `TERMINAL_KIND_LABEL_KEY`
  derives them by calling `resolveWhatsappCallActivityLabelKey` (the SAME sdk function `whatsapp-call-card.tsx` calls) against each kind's
  canonical `(outcome, direction)` pair, so a wrong kind→label association can no longer silently ship as a coincidentally-matching copy.
  **M6 (EXPLAIN, not yet run):** DB-side keyset/index verification is still pending migration approval — the unapplied
  `20260917173245_whatsapp_call_outcome_backfill_index` migration builds `WhatsappCall_workspaceId_createdAt_id_idx` (workspaceId,
  createdAt desc, id desc) `CONCURRENTLY` and drops the old two-column index; once that migration is approved and applied, run
  `EXPLAIN (ANALYZE, BUFFERS)` for at least: (a) `allCalls` scope, no filters, first page (cursor-less) — expects an index-only/index scan on
  the new composite index; (b) `allCalls` scope with a cursor (keyset continuation) — expects the same index, confirming the
  `createdAt < ?::timestamptz OR (createdAt = ?::timestamptz AND id < ?)` predicate is sargable against it; (c) non-admin `assignedOnly: true`
  scope, which additionally joins `conversationModel` and filters on `assignedUserId` — check whether a supporting index on
  `Conversation(assignedUserId)` (if one doesn't already exist) is needed to avoid a sequential scan on large workspaces; (d) an `activity`
  chip (`outcome` + `direction`) combined with a cursor, to confirm the `outcome`/legacy-status-fallback `OR` branch doesn't defeat the index;
  (e) the `allCalls` + `agentUserId` combination (admin agent filter), which adds an `OR` on `answeredByUserId`/`initiatedByUserId` — check
  for a supporting index on those columns given call volume. None of these were run in this pass (DB-free, mocked-chain tests only, per this
  agent's DO-NOT-MIGRATE constraint) — this is a real, unverified gap, not a formality.
- Fable review (on P5 item 6 filters + P6 items 1–2, implementation) → fixes applied: **B-H1 (HIGH)** —
  `?inboxId=abc`/`?agentUserId=abc` crashed the Calls page with an unhandled RSC 500: `schema/query.ts`'s
  `inboxIdQueryParser`/`agentUserIdQueryParser` were plain `parseAsString`, and `page.tsx` passed the parsed value straight to
  `listWhatsappCalls` with no zod validation of its own (unlike `listWhatsappCallsAction`, validated via `zodBigintAsString` at
  its `bindArgsSchemas`/`inputSchema` boundary), so a non-numeric id reached Postgres as a bigint comparison (22P02). Fixed by
  reusing the existing shared digit-validated parser `parseAsBigInt` (`@/lib/nuqs`, already the project's convention for exactly
  this class of id param — see `folderId` in `features/triggers/schema/query.ts`) for both params instead of inventing a
  second one — it resolves a non-numeric value to `null`, which `page.tsx`'s existing `?? undefined` already turns into "no
  filter". Same parser object shared between the search-params cache and `CallsPageClient`'s `useQueryStates`, so server and
  client can never disagree on what counts as a valid id. **B-M1 (MEDIUM)** — `list-call-filter-options.query.ts` used
  `inboxService.listWithIntegrationsByWorkspace` (eager-loads all nine credential-bearing integration relations, uncached,
  re-run on every filter change) just to read id/name and discard every non-whatsapp row in memory; replaced with a new bounded
  read scoped by workspace + channel at the query level: `inboxRepository.listOptionsByWorkspaceAndChannel` (relational
  `columns: { id, name }` query) wrapped by `inboxService.listChannelOptionsByWorkspace`. Deliberately left uncached —
  `inboxService.find()`'s own cache attempt is commented out with no invalidation wired for any inbox-scoped cache tag, so
  adding a fresh cache here would risk silent staleness instead of fixing the eager-load; caching this read is a separate,
  explicitly-scoped follow-up. `listWithIntegrationsByWorkspace` itself is untouched (still used by
  `workspace-lifecycle`'s teardown). **B-M2 (MEDIUM)** — `calls-table.tsx`'s local `formatDuration` (a byte-for-byte duplicate
  of `formatCallDurationSeconds`) removed in favor of the shared helper; the duplicated `CallFilterOption` type (declared once
  in `queries/list-call-filter-options.query.ts` and once in `calls-filter-bar.tsx`) now has a single declaration
  (`calls-filter-bar.tsx`), imported everywhere else. **B-L1 (LOW)** — `page.tsx` now scopes `agentUserId` to
  `showAgentFilter` (`isCallHistoryAdmin`) for BOTH the service call and the `CallsPageClient` props, so a non-admin's stale
  `?agentUserId=…` can no longer make `hasActiveFilter`/"Load more" treat an ignored filter as active; `CallsFilterBar` now
  falls back to the "all" sentinel when `inboxId`/`agentUserId` matches no known option (previously rendered a blank
  base-ui `Select` trigger). **B-L2 (LOW)** — `TERMINAL_KIND_LABEL_KEY` rewritten as a plain literal `Record` (each value
  still DERIVED via `resolveWhatsappCallActivityLabelKey`, never hand-typed) instead of an `Object.fromEntries` + `as` cast
  round-trip; `KIND_BADGE_CONFIG.labelKey` typed as `Parameters<ReturnType<typeof useTranslations>>[0]` instead of a bare
  `string`; the redundant "structural parity" `test.each` in `calls-table.test.tsx` (asserting the SAME four kind→label
  associations the literal `test.each` above it already pins) deleted. **B-L3 (LOW)** — the `value as string` casts in
  `calls-filter-bar.tsx`'s `onValueChange` callbacks removed; the ui-package `Select` wrapper does not preserve base-ui's
  generic `Value` type parameter (its own props type collapses to `Value = unknown`), so a local `narrowSelectValue` (`typeof
  value === "string"`) replaces the cast with a real narrow instead of retyping the shared, widely-used `Select` component
  (out of this item's scope). **A-L1 (LOW)** — `conversation-item.tsx`'s `CALL_PREVIEW_ICON_BY_KIND` mapped
  `unansweredVoiceCall` to `PhoneMissedIcon`, disagreeing with `whatsapp-call-card.tsx`'s own icon for the exact same call
  (`isMissedInbound` ? `PhoneMissedIcon` : `PhoneOffIcon`, and `unansweredVoiceCall` is the NOT-`isMissedInbound` case);
  aligned to `PhoneOffIcon`. **A-L3 (LOW)** — added a direct unit test for `formatCallDurationSeconds` (previously exercised
  only indirectly) and an outbound (`businessInitiated`) completed-with-duration preview test (the existing test only covered
  the default inbound direction).
  **P6 item 3 (calling preset) — CANCELLED by the owner's decision.** Not implemented in this pass or planned for a future
  one; the P6.3a/P6.3b spike-and-build plan in §5 above is superseded by this cancellation and should not be picked up
  without a new, separate approval.
  **Presence model simplified to ONE MEMBER PER USER, owner-directed (2026-09-18).** The per-browser-tab lease
  (`${userId}:${tabId}` member ids, lease-id rotation on reconnect/bfcache, explicit sign-off action + `pagehide`
  `sendBeacon` route, and the Redis tombstone that made heartbeat/sign-off ordering-safe) is REMOVED entirely and
  replaced with a member id = bare `userId`, `PRESENCE_TTL_MS` dropped 45s → 20s, and no sign-off path at all —
  exactly the reference presence-tracker model from §2.2: a user is "online" purely while something keeps
  renewing their single lease, and "offline" is detected only by silence, never by an event. A durable
  `WorkspaceMember.onlineSince` stamp (written on the offline→online transition only) was added on top so reporting
  can see "when did this member last come online" from the database.
  **Follow-up owner decision, same day: the sweeper was removed (2026-09-18).** A `WorkspaceMember.offlineAt` column
  plus an every-minute `sweepStaleOnlineWorkspaceMembers` cron (Redis-absence OR expired-auth-session detection) had
  been built to mirror "online → offline" into the database, but the owner judged this unnecessary machinery: Redis's
  own 20s TTL already answers "is this member online right now" at read time, so nothing needs to poll for staleness
  or write an offline transition. Deleted entirely: the cron, its job type, `offlineAt` (dropped from the schema and
  the still-unapplied migration — never shipped), `workspaceMemberRepository.listStaleOnlineCandidates`/`markOffline`,
  and the session-expiry repository/service (`sessionRepository`/`sessionService.listUserIdsWithLiveSession`), which
  had no other caller. The read helper moved from a DB-row predicate
  (`workspaceMemberPresenceService.isOnline`, since deleted) to `workspacePresenceService.isMemberOnline(workspaceId,
  userId)` — a single Redis `ZSCORE` (`presenceStore.isLive`) — because a database row can never itself answer
  "online right now" once nothing ever clears it back to offline. The 10s grace constant was dropped with it: it
  existed only to smooth over an eventually-consistent sweeper-driven DB mirror, which no longer exists. `onlineSince`
  remains, monotonic, as the sole durable artifact — a "last came online" stamp for reporting only. See
  `docs/realtime.md`'s "Presence lease" section for the current design.
  **Second follow-up owner decision, same day: presence moved off the client entirely (2026-09-18).** The
  per-browser-tab server action (`heartbeatWorkspacePresenceAction`, one call every 20s per tab) cost an uncached
  membership + workspace DB read per heartbeat — ~100 uncached reads/sec at 1,000 online agents. Deleted:
  `use-workspace-presence.ts`, `heartbeat-workspace-presence.action.ts`, and their mounting in
  `WorkspaceRealtimeShell` (which lost its now-unused `workspaceId` prop). Replaced with a realtime-server-reported
  design, matching the reference server-reported presence model: each `apps/realtime` `workspaces` room now schedules a PartyKit/Durable-Object alarm
  (`room.storage.setAlarm`, confirmed supported by this repo's `partykit@0.0.115`) on its first connection, and every
  20s POSTs the room's distinct connected user ids in ONE request to a new builder route,
  `POST /api/workspace-presence/report` — authenticated by the SAME `REALTIME_BROADCAST_SECRET`/`signRealtimeToken`
  scheme the party already uses to verify inbound broadcasts, reused in the reverse direction rather than invented
  anew. That route calls `workspacePresenceService.heartbeatMany`, which batches BOTH the Redis write
  (`presenceStore.heartbeatMany`, one Lua script for the whole reported set — prune + every `ZADD` + `PEXPIRE`) and
  the `onlineSince` database write (`workspaceMemberService.markOnlineBulk`, one bulk `UPDATE ... WHERE userId IN
  (...)` for exactly the newly-transitioned subset) into single round-trips regardless of batch size. Request volume
  now scales with ACTIVE WORKSPACES, not agent count or heartbeat frequency. The alarm stops the moment a room's last
  connection closes (`onClose`, not waiting for the next tick to no-op) and restarts on the next connection; a
  deliberate choice NOT to also send an immediate "went offline" report on close, since the batch write only ever
  adds/renews members and can never remove one — no report content there would make "offline" observably faster.
  `listOnlineMembers`/`isMemberOnline` are unchanged for ring targets. Verified: PartyKit binds one room id to
  exactly one Durable Object instance, so multi-pod double-reporting for the same workspace cannot happen in this
  deployment; `/api/*` already bypasses the sign-in middleware, so `proxy.ts`'s `PUBLIC_ROUTES` needed no change.
  **Same-day owner decision: Redis-outage resilience for presence.** No Redis call in `workspacePresenceService` may
  throw out of the service any more — `listOnlineMembers`/`isMemberOnline`/`heartbeatMany`'s Redis leg all route
  through one shared `withRedisFallback` helper that logs with the structured `err` key and degrades to
  `[]`/`false`/no-newly-live instead. No DB fallback was added (`onlineSince` is monotonic and cannot answer "online
  now"), and no `lastSeenAt` column either. Traced end-to-end for VoIP: `selectRingTargetsForCall` already returns
  `{ tier: null, userIds: [] }` for an empty online set, so a Redis-degraded `[]` takes that SAME pre-existing path —
  `handleConnect` rejects immediately via the fenced-CAS-safe `endReservedCall`, never throwing, retry-looping, or
  waiting on the independently-scheduled `expireIfUnanswered` deadline job. A fully Redis-down outage still fails
  earlier, at `reserveIncomingCall`/`readControl`'s own `casStore` calls (unrelated to presence, pre-existing, and
  already covered by bounded BullMQ retries plus that same durable deadline job). The presence-report route's Redis
  write failing the same way is why that route can always answer a plain `200` — never a 5xx that could retry-storm
  the realtime server, especially since the realtime server's own caller has no retry logic and the next 20s report
  supersedes a lost one anyway.
- **Round-2 review (server-reported presence), 2026-09-18 → fixes applied, then tightened same day after an
  automated security follow-up:**
  **BLOCKER-a (rolling-deploy outage)** — `verifyRealtimeToken` rejected any token missing the `purpose` claim, so a
  deploy where `apps/realtime` ships before `apps/builder`/`apps/worker` (the only two `broadcast`-purpose minters,
  `packages/partysocket-config/src/lib.ts`) would 401 EVERY websocket upgrade (`onBeforeConnect`) and EVERY realtime
  broadcast (`verifyBroadcastRequest`) — including call ring/answer/ended — for the whole rollout window. No deploy
  ordering is enforced anywhere (`scripts/deployment/upgrade.sh` stops/starts `builder worker realtime` as one
  undifferentiated group). Fixed with a `VerifyRealtimeTokenOptions.allowLegacyMissingPurpose` flag on
  `verifyRealtimeToken`: a purpose-less token verifies as if it matched; a present-but-wrong purpose is still
  rejected unconditionally.
  **Tightened after an automated security review of the first pass:** the flag was initially applied to BOTH
  `verifyBroadcastRequest` and `verifyMemberConnectToken`, which would have been a privilege escalation — both bind
  to the identical `workspace:<id>` audience under the same shared `REALTIME_BROADCAST_SECRET`, so a purpose-less
  member-connect token could have been replayed as a broadcast-authorized request (able to `room.broadcast`/
  target-send/revoke). Verified against `main` (pre-branch) that `member-connect` and `presence-report` are BOTH
  brand new to this branch — `main`'s `onBeforeConnect` authenticated via a session cookie (`getAuthSession`), never
  a JWT — so no purpose-less token of either kind can ever legitimately exist; the exception was removed from
  `verifyMemberConnectToken` entirely (kept strict) and left on ONLY `verifyBroadcastRequest`, the one path with real
  pre-existing (production `main`) purpose-less tokens in flight. Also added `LEGACY_PURPOSE_WINDOW_CUTOFF`
  (`2026-09-25T00:00:00.000Z`, one week out): the exception is honored only before this wall-clock cutoff, closing
  the window automatically even if a stuck/zombie old-code pod keeps minting fresh purpose-less tokens indefinitely,
  independent of the follow-up removal ticket landing. See `docs/realtime.md`'s "Safe deploy order & rolling-deploy
  token compatibility" section for the full writeup. Tests: legacy token accepted for broadcast, rejected for
  member-connect and presence-report; present-but-wrong purpose rejected everywhere regardless of the flag; a
  freshly-minted member-connect token rejected by the broadcast verifier and vice versa; accepted just before the
  cutoff, rejected at/after it (`vi.useFakeTimers`).
  **MEDIUM-c (first-connection double report)** — `WorkspaceParty#onConnect` checked `getAlarm()`, then awaited
  `storage.put`, then awaited the network `reportWorkspacePresence` call, and only armed the alarm AFTER that network
  await. A Durable Object's input gate stays closed across storage awaits but opens across a fetch await, so two
  `onConnect` calls racing in during a reconnect storm (every tab after a realtime redeploy) could both observe
  `getAlarm() === null` before either had armed it, and both POST. Fixed by arming the alarm (`setAlarm`) BEFORE the
  network await, and — since a harness-independent guarantee is stronger than relying on exact DO gate semantics —
  serializing the whole check-then-act bootstrap behind a per-instance `Promise` mutex (`bootstrapLock`) so only one
  concurrent `onConnect` call can ever see and act on a null alarm. The winning call's report now covers every
  already-connected user id (`collectConnectedUserIds()` unioned with the connecting user), not just the connecting
  one, since `connection.setState` runs before the lock is acquired — any other connection queued behind the lock
  has already recorded its state by the time the winner builds its report. Test: two `onConnect` calls started via
  `Promise.all` produce exactly one `reportWorkspacePresence` call, containing both user ids.
  **LOW-d (comment overclaim)** — `packages/partysocket-config/src/presence.ts`'s `PRESENCE_REPORT_INTERVAL_MS` doc
  comment claimed "a single slow/lost report never flaps" a member offline; true only for a SLOW report (the next
  fixed-cadence report is unaffected by how long the previous one took). A fully LOST report is NOT protected the
  same way — the next renewal lands right at the TTL boundary (likely after it, given normal latency/jitter), so
  that member's Redis entry can expire, read as "newly live" again, and trigger one bulk `UPDATE` — a real, brief,
  self-healing flap. Comment reworded to say this precisely; the TTL/interval constants themselves were NOT changed
  (owner-chosen 20s/10s).
  **LOW** — the presence-report route's `workspaceId` query param now goes through `zodBigintAsString()` before use
  (previously only checked for presence/absence), matching the shape check already applied to the request body's
  `userIds` and to every other bigint-id query param elsewhere in the app; it must still equal the verified token's
  audience, which is unchanged. Test: a non-digit `workspaceId` now 400s (previously it would have reached token
  verification and 401'd instead, on an unrelated malformed-JWT error — the new check answers with the correct
  reason).
  **LOW (stale comments)** — `packages/business/src/workspace-member/synthetic.ts`'s `onlineSince` comment still said
  a heartbeat's `markOnline` would update it; the method was renamed to `markOnlineBulk` in the same-day presence
  redesign above. `apps/builder/src/app/api/workspace-presence/report/route.ts`'s top comment still said "every 20s"
  after the report interval was halved to 10s in the same redesign; both corrected to reference the current names/
  values.
  **Presence stays silent in the UI, confirmed by grep:** no client (`"use client"`/`.tsx`) component calls any
  `workspace-presence`/`workspacePresence`/`reportWorkspacePresence`/`heartbeatMany`/`listOnlineMembers` symbol —
  the only hits under `apps/builder/src` for any of those are the server-only report route, the VoIP heartbeat
  server action, and a `sendBeacon`-fed server route's auth helper (all server-side). The single client-side match
  for the word "presence" in `.tsx` files is a stale doc comment in `chat-layout.tsx`, not a live call. Every
  failure path traced (`reportWorkspacePresence`'s catch, the report route's `heartbeatMany` catch,
  `workspacePresenceService`'s `withRedisFallback`) logs server-side with the structured `err` key and degrades
  silently — no toast, no thrown error that could reach a client boundary, no user-visible state anywhere in this
  flow.
