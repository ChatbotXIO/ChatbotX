# WhatsApp Business Calling — VoIP mode (browser WebRTC)

> Detailed architecture for the browser WebRTC calling path. The product-level
> overview lives in [`whatsapp-calling.md`](./whatsapp-calling.md).

## Why browser WebRTC
Meta WhatsApp Business Calling offers two transports for a user-initiated call: a
SIP interconnect to a self-hosted media server, and VoIP mode, where the `calls`
connect webhook carries an SDP **offer** (`session.sdp_type:"offer"` — WebRTC:
ICE, DTLS-SRTP, OPUS) and the business answers with an SDP **answer** through the
Graph API (`pre_accept` then `accept`). Media then flows over WebRTC directly
between the answering peer and Meta.

ChatbotX uses VoIP mode exclusively, with the **agent's browser** as the WebRTC
peer, so there is no media server to operate (Meta docs:
`.../whatsapp/calling/user-initiated-calls`). A connect webhook is routed to the
calling path only when it carries a **validated** `session.sdp_type:"offer"`.

## Meta Graph API (verified against Meta docs)
`POST /{phone_number_id}/calls` with `{ messaging_product:"whatsapp", call_id, action, session? }`:
- `action: "pre_accept"` + `session:{ sdp_type:"answer", sdp }` — **required before accept**; sending `accept` first is rejected.
- `action: "accept"` + `session:{ sdp_type:"answer", sdp }` — same answer SDP.
- `action: "reject"` / `action: "terminate"` — no session.
- Business has **30–60 s** after the connect webhook to accept, else Meta reports "Not Answered".
- Flow media only after the `accept` returns 200.

## Identifier discipline
Every client (browser) action takes the DB **`WhatsappCall.id`**. The server resolves
WACID, workspaceId, inboxId, integration + WhatsApp auth, and TURN credentials from
that row. The browser never chooses `phoneNumberId`, credentials, or the target agent.

## Security & reliability contracts

1. **SDP never reaches logs — surgical, key-named redaction.** Add only the `sdp`
   KEY (not `session`) to the recursive redaction set (`packages/logger/src/redact.ts`)
   so both pre-handler body logs are scrubbed
   (`apps/builder/src/app/integrations/[...integration]/webhook.ts`,
   `apps/builder/src/app/integrations/whatsapp/webhook/[integrationId]/route.ts`).
   The SDP-bearing Graph client logs structured, SDP-redacted errors (never the raw
   `rescue()` logger). This is deliberately narrower than redacting the whole
   `session` envelope: the shipped WhatsApp `session` object is exactly
   `{ sdp_type, sdp }`, and only `sdp` is sensitive — `sdp_type` (`"offer"`/`"answer"`)
   and the surrounding direction/action fields are useful for debugging and carry no
   payload. Because redaction recurses into nested objects, `session.sdp` is blanked
   the same as a top-level `sdp` key, so the SDP payload itself never reaches logs
   either way — only the harmless envelope shape survives. **Threat-model note:**
   wholesale `session` redaction was intentionally NOT done, since it would blank
   `sdp_type` for zero additional protection (the one sensitive field, `sdp`, is
   already covered by the key-named rule) while making incident logs harder to read.

2. **SDP never persists in BullMQ.** At the webhook boundary the VoIP connect is peeled
   off before the generic raw-body enqueue: write the offer to Redis
   `voip:offer:<wacid>` with `SET NX PX=(deadlineAt-now)` (immutable first-seen
   `deadlineAt`; redelivery cannot overwrite/extend), then enqueue a **slim** job
   `{ wacid, deadlineAt }` (no SDP) on a dedicated queue with
   `removeOnComplete/removeOnFail: true`. SDP lives only in short-TTL Redis.

3. **Deadline-aware signaling queue.** New `whatsappVoipSignaling` BullMQ queue +
   consumer, separate from the shared integration queue (which starves prioritized
   work); short deadline-aware retry. A delayed cleanup job fires at `deadlineAt`; if
   still unanswered it `reject`/`terminate`s Meta and finalizes the DB row (never
   relying on TTL expiry alone).

4. **Realtime targeted, room-bound delivery.** Builder mints a one-time token bound to a
   verified `{ userId, workspaceId }` (member-only). The `workspaces` party rejects the
   upgrade when `workspaceId !== room.id` (mirror the privileged room-claim check in
   `apps/realtime/src/lib/realtime-auth.ts`), tags the connection by verified `userId`
   (PartyKit `getConnectionTags`), and the server delivers the offer only via
   `room.getConnections(userTag).send()` — never `broadcast`. Ring-all (#5) delivers
   the SAME offer to every live rung agent this way — one targeted send per agent, in
   parallel — never a single workspace-wide broadcast of the SDP. On membership
   removal the user's tagged sockets are closed; the ≤60 s offer TTL bounds residual
   exposure. Remove the two realtime token log leaks (`apps/realtime/src/lib/auth.ts`).

5. **Ring-all + fenced claim/accept.** Shipped as RING-ALL, not single-agent
   reservation: `whatsappVoipCallService.resolveRingTargets` resolves every agent with
   the inbox open (`whatsappVoipPresenceService`, capped at `MAX_VOIP_RING_TARGETS`)
   and creates ONE control record with `reservedUserId: ""` (unclaimed — mirrors the
   SIP fork-dial). The worker's `handleConnect` delivers the SDP offer to every one of
   those agents via `sendToWorkspaceMember` (never a broadcast). Call control lives in
   Redis `voip:ctrl:<wacid>` = `{ reservedUserId, phase, deadlineAt, fenceToken }`,
   `phase: "reserved" | "answering" | "accepted" | "terminated"`. Transitions are
   single atomic Redis **Lua CAS** ops:
   - `claimForAnswer` — `reserved (reservedUserId:"") → answering (reservedUserId:userId)`.
     Only the first agent to call this wins; the fenced CAS guarantees exactly one
     winner even under a simultaneous-answer race. On success every OTHER rung agent
     is told via a best-effort workspace broadcast of `whatsappCallClaimedElsewhere`
     (`answer-voip-call.action.ts`) — the winner's own client ignores it via
     `answeredByUserId`, and every losing dialog clears immediately instead of
     waiting out the deadline.
   - `releaseClaim` — fenced rollback `answering → reserved (reservedUserId:"")`, used
     when the winning agent's own Graph `accept` attempt fails. This re-opens the call
     to every other rung agent (and to the same agent after a refresh, via
     `getResumableIncoming`) within the original deadline, instead of stranding the
     call `answering` until expiry. It intentionally does NOT loosen the general
     `ALLOWED_TRANSITIONS` table — this is a narrowly fenced, one-off exception.
   - `commitAccepted` — `answering + matching fenceToken → accepted`, after Graph
     `accept` returns 200.
   - `endCall` — the single termination primitive for every end-of-call path (reject,
     hangup, expiry cleanup, finalize); advances to `terminated` from any non-final
     phase and returns `{ fromPhase, graphAction, terminalStatus }` so every caller
     reads the Graph action AND the DB-persisted status from the same phase→outcome
     table instead of re-deriving either with its own if-chain.

   Terminate/expiry always wins a race against an in-flight accept, because every CAS
   is checked against Redis's live value, never a cached read. Graph HTTP calls run
   **outside** any lock.

   **Who receives which "ended" event:** `finalizeCallSideEffects`'s VoIP branch reads
   the control BEFORE tearing it down: if `reservedUserId` is set (someone claimed
   it), `whatsappCallTransportEnded` is sent ONLY to that agent via
   `sendToWorkspaceMember` (offer-adjacent, targeted). If the call ends while still
   UNCLAIMED (`reservedUserId === ""` — the caller hung up mid-ring, or the offer/CAS
   never got claimed before expiry), there is no single agent to target — every rung
   agent's dialog is still ringing — so the SAME event is instead BROADCAST to the
   whole workspace party via `broadcastToWorkspaceParty`; the client's `handleEnded`
   already clears any dialog it doesn't recognize as its own, so agents who were never
   rung are unaffected. No control record at all means nobody was ever rung, so
   nothing is sent either way.

6. **Guarded acceptance persistence (no resurrection).** After the accept CAS wins and
   Graph `accept` returns 200, persist via one conditional UPDATE
   `markAcceptedByAgent({ whatsappCallId, agentUserId })`:
   `SET status='accepted', "answeredByUserId"=:userId WHERE id=:id AND status NOT IN
   ('rejected','completed','failed')` (the only persisted terminal statuses; `missed`
   is UI-derived). PostgreSQL re-evaluates the predicate under row lock, so a terminal
   write wins permanently and can never receive `answeredByUserId`. Repository method
   only — no app-layer `db`, no raw string interpolation. App code reaches it through
   `whatsappVoipCallService`, never the repository directly.

7. **`finalizeEndedCall` idempotency.** A terminate webhook arriving after a locally-written
   terminal status still fills missing `endedAt`/terminal metadata idempotently, without
   downgrading status or overwriting an earlier authoritative end time.

## Threat model notes (M-series)

- **M6 — pickup is workspace-wide, wider than the live rung set (accepted design).**
  `getResumableIncoming`/`claimForAnswer` are reachable by ANY current workspace
  member who mounts the inbox — not only the ≤`MAX_VOIP_RING_TARGETS` agents who were
  actually live (and therefore rung) at connect time. An agent who opens the inbox
  seconds after a call started, and was never sent the offer, can still resume and
  claim it as long as the control is still `phase:"reserved"`/`reservedUserId:""` and
  the offer TTL hasn't lapsed. This is an accepted design decision, not a gap: any
  member of the workspace is trusted to pick up a ringing call for that workspace —
  the same trust boundary the SIP fork-dial and the inbox itself already extend to
  every member. Documenting it here makes it explicit rather than an implicit
  assumption future readers might mistake for a bug.

## Browser WebRTC (standard, no SDP munging)
`use-whatsapp-voip-call` (native `RTCPeerConnection`, NOT sip.js):
`setRemoteDescription(offer)` → `addTrack(getUserMedia audio)` → `createAnswer()` →
`setLocalDescription()` → **wait `iceGatheringState==="complete"`** (deadline-capped) →
send the full answer SDP to the answer action. The browser generates DTLS `a=setup`,
ICE role, codecs, candidates — never hand-edit SDP. ICE servers = STUN + short-lived
coturn TURN from `getVoipTurnCredentials(whatsappCallId)` (scoped to the reserved caller
and that call; NOT the SIP `softphone-credentials.action`). Media flows only after
`accept` 200. Close the peer on the transport-tagged `ended` realtime event.

## Realtime event contract
Add a discriminated SIP/VoIP payload in `packages/partysocket-config/src/schemas.ts`
(`transport: "sip" | "voip"`, variants incoming/ended). VoIP variants carry
`whatsappCallId`/`wacid` and **no `rootUuid`**. `ChatRealtime` and the shared finalizer
emit the transport-tagged ended event for both transports.

## Multi-agent behaviour

- **Resume after refresh.** `getResumableIncoming({ workspaceId })` lets an agent who
  reloads mid-ring (or opens the inbox after the call started) pick the call back up:
  it scans candidate rows via `whatsappCallRepository.findRingingByWorkspace`, and for
  each checks the live control is exactly `phase:"reserved"` + `reservedUserId:""`
  (still unclaimed) with an offer still in Redis, returning the first match shaped
  identically to the realtime `whatsappCallTransportIncoming` payload so the dock can
  render it the same way. `get-pending-incoming-voip-call.action.ts` calls this on
  dock mount. See M6 above for who is allowed to call it.
- **Presence heartbeat.** `whatsappVoipPresenceService` (Redis `presenceStore`,
  `voip:presence:<workspaceId>`) is the VoIP ring-set source, deliberately independent
  of SIP `REGISTER` presence — an agent counts as "available" simply by having the
  inbox open, heartbeating every well inside `VOIP_PRESENCE_TTL_MS` (45 s) via a
  builder hook while the call dock is mounted. No explicit sign-off is required: a
  closed tab drops out within one TTL.
- **Recording upload (browser-side, not media-path).** The answering agent's browser
  captures the call locally via `MediaRecorder` (`voip/call-recorder.ts`) and uploads
  the result through `apps/builder/src/app/api/whatsapp-call-recording/route.ts` once
  the call ends. This is explicitly NOT server-side/media-path recording — Meta's
  WebRTC media never transits a server we control, so there is no media-path tap to
  record from; the recording is only as complete as what the answering agent's own
  browser captured.
- **Transcript enrichment.** `apps/worker/src/integration/handlers/whatsapp-call-transcribe.ts`
  transcribes the uploaded recording and enriches the call's activity message,
  emitting a realtime `messageContentUpdated` event so the inbox updates the call row
  in place once a transcript becomes available, without a full message re-fetch.
- **Hangup beacon on tab close.** `apps/builder/src/app/api/whatsapp-voip-call-hangup/route.ts`
  is a dedicated route hit via the `pagehide` event (`use-whatsapp-voip-call.ts`) so a
  closed tab / navigated-away agent still triggers a hangup server-side instead of
  leaving the call to time out on Meta's own deadline.
- **Bubble-to-top.** An active/ringing VoIP call's conversation is surfaced at the top
  of the conversation list (`chat-store.ts`, `conversation-list.tsx`) so an incoming
  call is never buried under unrelated activity.

## Parser boundary
`integrations/whatsapp/src/lib/calls.ts`: the user-initiated connect gains a bounded
discriminated `session: { sdp_type:"offer"; sdp: string /* ≤ ~100 KB */ }`; a
malformed/oversized supplied session is **rejected** (warn), never silently treated as
SIP. Mirror the bounded field in the worker-config queue payload
(`packages/worker-config/src/queues/integration/index.ts`) if it flows through there;
otherwise the slim VoIP job type carries only `{ wacid, deadlineAt }`.

## Test matrix
parser valid/malformed/oversized · Graph payload shapes + SDP-absent-from-logs (both
webhook routes, sub-64 KB sentinel) · two-answerer race (one wins) · cross-room token
replay rejected · redelivery does not extend TTL · deadline expiry cleanup path ·
accepted persisted before the 90 s stale sweep · ICE-gathering-complete gating · fence
inverse race (accept CAS wins, terminate advances before DB write → guarded UPDATE
no-ops + Graph terminate compensation) · forward race (accept persists, later terminate
fills `endedAt`, no downgrade) · `finalizeEndedCall` terminal idempotency ·
**`releaseClaim` on a Graph `accept` failure** (rolls `answering` back to `reserved`/
`reservedUserId:""` so another rung agent — or the same agent post-refresh — can still
claim within the original deadline) · **losing agents cleared on a winning answer**
(every non-winning rung agent receives `whatsappCallClaimedElsewhere` and clears its
dialog; the winner ignores its own broadcast via `answeredByUserId`) ·
**losing agents cleared on caller-hangup-while-ringing** (an unclaimed call that ends —
caller hangs up mid-ring, or the offer/CAS expires unclaimed — broadcasts
`whatsappCallTransportEnded` to the whole workspace instead of targeting nobody, so
every rung agent's dialog clears immediately instead of waiting out its own client
deadline timer) · **dismiss-during-answering compensation** (a `commitAccepted` CAS
loss, or a `markAcceptedByAgent` DB-write loss, after Graph `accept` already
succeeded compensates with a Graph `terminate` and reports `callEnded` rather than
persisting an `accepted` row the call has already moved past).

## Required infrastructure (operator)
A **publicly reachable coturn (TURN)** server for browser↔Meta media on hostile NATs.
Without it, media will not connect in production even though signaling succeeds.
