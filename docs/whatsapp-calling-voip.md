# WhatsApp Business Calling — VoIP mode (browser WebRTC)

> Detailed architecture for the browser WebRTC calling path. The product-level
> overview lives in [`whatsapp-calling.md`](./whatsapp-calling.md).

## Why browser WebRTC
Meta WhatsApp Business Calling's VoIP mode is where the `calls` connect webhook
carries an SDP **offer** (`session.sdp_type:"offer"` — WebRTC: ICE, DTLS-SRTP,
OPUS) and the business answers with an SDP **answer** through the Graph API
(`pre_accept` then `accept`). Media then flows over WebRTC directly between the
answering peer and Meta.

ChatbotX uses VoIP mode exclusively, with the **agent's browser** as the WebRTC
peer, so there is no media server to operate (Meta docs:
`.../whatsapp/calling/user-initiated-calls`). A connect webhook is routed to the
calling path only when it carries a **validated** `session.sdp_type:"offer"`.
There is no SIP transport or self-hosted media server (FreeSWITCH) in this
codebase — an earlier iteration used one, but it was fully removed in favor of
this browser-WebRTC path; `transport` in the realtime payload contract is a
`z.literal("voip")`, not a union.

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
   and creates ONE control record with `reservedUserId: ""` (unclaimed — the classic
   telephony fork-dial pattern). The worker's `handleConnect` delivers the SDP offer to every one of
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
     `listResumableIncoming`) within the original deadline, instead of stranding the
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

8. **A call that already ended is never rung.** Meta does not order a call's webhooks, so
   the caller's `terminate` can be processed before the VoIP `connect`. That terminate
   finds no offer and no control to clean up, so `handleConnect` checks the row itself,
   at three points: before anything else (terminal → drop the offer, no Graph reject of a
   dead call), after `resolveRingTargets` (terminal → end the control it just created,
   still without Graph), and after delivering the offer (terminal → re-send
   `whatsappCallTransportEnded` to the agents it rang, because the finalize's own ended
   event may have reached them before the offer did). The finalize writes the terminal
   row before it emits, which is what makes the last re-read sufficient. Its transport
   cleanup (end the control, drop the offer, emit ended) runs on every delivery, not only
   the one that inserted the call card: a finalize that died after the insert is retried
   as `isNew: false`, and gating the cleanup on `isNew` would leave agents ringing a call
   that is already over.

## Threat model notes (M-series)

- **M6 — pickup is workspace-wide, wider than the live rung set (accepted design).**
  `listResumableIncoming`/`claimForAnswer` are reachable by ANY current workspace
  member who mounts the inbox — not only the ≤`MAX_VOIP_RING_TARGETS` agents who were
  actually live (and therefore rung) at connect time. An agent who opens the inbox
  seconds after a call started, and was never sent the offer, can still resume and
  claim it as long as the control is still `phase:"reserved"`/`reservedUserId:""` and
  the offer TTL hasn't lapsed. This is an accepted design decision, not a gap: any
  member of the workspace is trusted to pick up a ringing call for that workspace —
  the same trust boundary the inbox itself already extends to every member.
  Documenting it here makes it explicit rather than an implicit assumption
  future readers might mistake for a bug.

## Browser WebRTC (standard; one SDP normalization)
`use-whatsapp-voip-call` (native `RTCPeerConnection`, NOT sip.js):
`setRemoteDescription(offer)` → `addTransceiver("audio", { direction: "sendrecv" })`
with **no track** (mic acquired but not attached) → `createAnswer()` →
`setLocalDescription()` → **wait `iceGatheringState==="complete"`** (deadline-capped) →
send the full answer SDP to the answer action. The browser generates DTLS `a=setup`,
ICE role, codecs, candidates — never hand-edit SDP. ICE servers = STUN + short-lived
coturn TURN from `getVoipTurnCredentials(whatsappCallId)` (scoped to the reserved caller
and that call). Transport-tagged `ended` realtime event closes the peer.

- **The one SDP rewrite: an outbound answer's DTLS role.** For a business-initiated call
  the browser's offer carries `a=setup:actpass`, and Meta echoes `actpass` back in its
  answer. RFC 5763 requires an answerer to choose `active` or `passive`, and browsers
  refuse the answer otherwise (libwebrtc: "Answerer must use either active or passive
  value for setup attribute") — signalling succeeds but `setRemoteDescription` fails and
  no media flows. `captureOutboundAnswer` rewrites each whole `a=setup:actpass` line to
  `a=setup:active` (`voip-sdp.ts`, `pinAnswerDtlsSetup`) before the answer is stored, so
  every tab applies an answer it can accept. `active` is what an answer with no setup
  attribute means (RFC 4145). Nothing else in any SDP is edited, and inbound calls are
  untouched: there the browser writes the answer itself.

- **No early media.** The same cached answer SDP string is sent to `pre_accept` and
  `accept` (Meta requires them identical). The mic is attached with
  `sender.replaceTrack(micTrack)` only after `accept` returns 200 (inbound) or the
  outbound `ACCEPTED` status arrives — no renegotiation, no RTP before accept.
- **Server-side answer deadline.** `answerVoipCallAction` re-checks the control
  `deadlineAt` (3 s margin) before claim, before `pre_accept` and before `accept`;
  an expired call makes no Graph call and returns `cannotAnswer`.
- **Connection health.** `connectionstatechange` → `failed` ends the call
  immediately; `disconnected` longer than 8 s ends it (recovery cancels the timer).
  The panel shows `connectionLost`.
- **Active-call liveness.** While a call is active the tab calls
  `heartbeatActiveVoipCallAction` every 20 s; it renews the 4 h accepted control via
  fenced CAS and, at most once every 2 min, refreshes the row's `updatedAt` through
  `whatsappCallRepository.touchLivenessIfStale`. Nothing closes an `accepted` call on
  a timer: "no heartbeat" is evidence, never proof, that a call ended (a suspended
  tab, or a browser that still reaches Meta's relay but not ChatbotX, looks
  identical), and `sweepStaleWhatsappCalls` only ages out `ringing` rows.
- **Dial-time recovery of a stranded call.** A call left `accepted` forever because
  its `terminate` webhook never arrived holds the one-live-call-per-contact guard.
  `whatsappVoipCallService.assertNoActiveCallForContact` releases it — but only when
  an agent explicitly dials that same contact again, which is itself the human
  confirmation that the old call is over — and only when three guards agree: the row
  is `accepted`, its Redis control is gone or already `terminated`, and it has had no
  liveness touch for 30 min. The last two are ONE conditional statement
  (`whatsappCallRepository.recoverStrandedAccepted`: `UPDATE … SET status='completed'
  WHERE id = ? AND status = 'accepted' AND updatedAt < cutoff RETURNING`) — claiming
  the row and then terminalizing it would leave a gap in which a heartbeat could no
  longer prove the call live. Losing that update means either a heartbeat won (row
  still `accepted` → dial refused) or a real terminate won (row already terminal →
  dial allowed); the code re-reads to tell them apart. The recovery is local
  (`lastError: "stranded-accepted-recovered-on-dial"`) and never calls Meta — a call
  whose media really stopped is dropped by Meta itself (138021/138022). The row is
  recorded `completed` (reaching `accepted` means it connected); `endedAt` and
  `durationSeconds` stay null rather than guessed, which also leaves a delayed
  terminate free to stamp the real values. It deliberately emits **no** activity card,
  realtime event or workflow trigger: those belong to an authoritative terminate.
- **Manual integrations** can place calls, but ChatbotX can never confirm that the
  customer's own Meta app is subscribed to the `calls` webhook field (unlike a
  platform-credential integration, which ChatbotX verifies/auto-subscribes) — if it
  is not, outbound calls never receive Meta's SDP answer/status webhooks and inbound
  calls never ring. `resolveOutboundCallModeAction` reports this as
  `manualCallsSubscriptionUnverified: true` for every manual integration, and the
  call button shows a pre-dial warning dialog reminding the user to check their Meta
  App Dashboard subscription before proceeding. A manual integration with no App
  Secret additionally carries `unsignedWebhookWarning: true` (its incoming webhooks
  are not signature-verified), shown as a second paragraph in the same dialog.
  Webhooks on the manual route are bound to the integration's own `phoneNumberId` —
  changes for any other number are dropped before enqueue.

## Realtime event contract
The transport-tagged payload lives in `packages/partysocket-config/src/schemas.ts`
(`transport: z.literal("voip")` — kept as a literal, not stripped, so existing
clients keep parsing the payload unchanged; browser WebRTC is the only transport).
Variants carry `whatsappCallId`/`wacid` and **no `rootUuid`**. `ChatRealtime` and
the shared finalizer emit the transport-tagged ended event.

## Multi-agent behaviour

- **Concurrent offers (the ringing basket).** Ring-all means several customers can be
  ringing one workspace — and one agent — at the same moment. The browser store keeps
  two distinct things: `ringingCalls`, the basket of offers made TO this agent, and the
  single `call` slot, the one call they are ENGAGED with. A basket entry is pure data:
  no `RTCPeerConnection`, no microphone, no timer of its own. `enqueueRinging` adds one,
  `promoteRinging` moves one into the slot atomically (returning `false` if the slot is
  taken), and only then is a peer built. An id is never in both at once. The panel
  renders one big card for a single offer, a compact list for several, and stacks that
  list above the call in progress when the agent is already busy — see
  `docs/superpowers/specs/2026-09-16-whatsapp-multi-ring-design.md` for the full table.
- **Answering while already on a call.** There is no hold. Answering a second offer
  ends the current call first, behind a confirmation dialog that names both parties,
  and only promotes the new offer once the server CONFIRMS the hangup — never on the
  best-effort local `hangup()`. An agent who is mid-conversation hears a short
  call-waiting beep rather than the full ringtone.
- **Resume after refresh.** `listResumableIncoming({ workspaceId })` lets an agent who
  reloads mid-ring (or opens the inbox after the call started) pick the calls back up:
  it scans candidate rows via `whatsappCallRepository.findRingingByWorkspace`, and for
  each checks the live control is exactly `phase:"reserved"` + `reservedUserId:""`
  (still unclaimed) with an offer still in Redis, returning EVERY match (bounded by the
  repository's limit) shaped identically to the realtime
  `whatsappCallTransportIncoming` payload so the dock can render them the same way.
  `get-pending-incoming-voip-call.action.ts` calls this on dock mount and enqueues each
  entry into the basket. See M6 above for who is allowed to call it.
- **Presence heartbeat.** `whatsappVoipPresenceService` (Redis `presenceStore`,
  `voip:presence:<workspaceId>`) is the VoIP ring-set source — an agent counts as
  "available" simply by having the inbox open, heartbeating every well inside
  `VOIP_PRESENCE_TTL_MS` (45 s) via a builder hook while the call dock is mounted. No
  explicit sign-off is required: a closed tab drops out within one TTL.
- **Recording mode.** Each `WhatsappIntegration` row has a `callRecordingMode`
  column: `"metaNative"` (default) or `"browserWhisper"` (opt-in, requires
  `callRecordingEnabled`).
  - `metaNative`: Meta records the call server-side and delivers the recording and,
    separately, the transcript via their own native recording/transcription webhooks
    (`handleWhatsappCallNativeRecordingFetch`,
    `handleWhatsappCallNativeTranscriptFetch`) — there is no browser upload and no
    OpenAI Whisper call for this mode.
  - `browserWhisper`: the answering agent's browser captures the call locally via
    `MediaRecorder` (`voip/call-recorder.ts`) and uploads the result through
    `apps/builder/src/app/api/whatsapp-call-recording/route.ts` once the call ends —
    this is browser-side, NOT server-side/media-path recording, since Meta's WebRTC
    media never transits a server we control, so the recording is only as complete as
    what the answering agent's own browser captured. If `callTranscriptionEnabled` is
    also set, `apps/worker/src/integration/handlers/whatsapp-call-transcribe.ts`
    transcribes the uploaded recording with OpenAI Whisper (a paid call) and enriches
    the call's activity message, emitting a realtime `messageContentUpdated` event so
    the inbox updates the call row in place once a transcript becomes available,
    without a full message re-fetch. The upload route independently gates on the
    caller being the answering agent, `callRecordingEnabled`, `callRecordingMode ===
    "browserWhisper"`, and the workspace owner's access state (a trial-expired or
    otherwise blocked owner is rejected the same way `workspaceActionClient` rejects
    a paid mutation) before it ever queues that paid transcription job.
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
malformed/oversized supplied session is **rejected** (warn), never silently accepted.
Mirror the bounded field in the worker-config queue payload
(`packages/worker-config/src/queues/integration/index.ts`) if it flows through there;
otherwise the slim VoIP job type carries only `{ wacid, deadlineAt }`.

## Webhook/flow-trigger payloads (`callRecorded` / `callTranscribed`)
Both call events are dispatched to workspace webhooks and flow triggers with their
call metadata passed straight through (`apps/worker/src/webhook/services/webhook-payload.builder.ts`):

- **`callRecorded`** carries `recordingUrl` — a **presigned, time-limited URL**
  (`callRecordingService.getRecordingSignedUrl`,
  `RECORDING_SIGNED_URL_TTL_SECONDS` = **15 minutes**), never a public storage URL.
  A consumer (webhook receiver, flow step) that stores this URL for later use, or
  delays processing past the 15-minute window, must re-fetch a fresh one via
  `getCallRecordingUrlAction` / `callRecordingService.getRecordingUrlForCall`
  rather than reuse the expired link. The same TTL backs the
  `{{last_call_recording}}` flow variable
  (`packages/variables/src/helpers/last-call.ts`).
- **`callTranscribed`** carries the **full transcript text** of the call. This is
  potentially sensitive/PII content (whatever the caller and agent said) —
  workspace admins wiring this into a webhook or a flow step are responsible for
  handling it accordingly (e.g. not logging it verbatim, respecting data-retention
  policy). See `docs/whatsapp-calling-gap-analysis-plan.md` (R26) for the decision
  record: presigned URL + full transcript were kept as-is, short TTL and PII
  handling are documented rather than replaced with an opaque-id + authenticated
  fetch pattern.

## Test matrix
parser valid/malformed/oversized · Graph payload shapes + SDP-absent-from-logs (both
webhook routes, sub-64 KB sentinel) · two-answerer race (one wins) · cross-room token
replay rejected · redelivery does not extend TTL · deadline expiry cleanup path ·
accepted persisted before the 90 s stale-*ringing* sweep · ICE-gathering-complete gating · fence
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
TURN is a media relay: the agent's browser AND Meta's media servers both send RTP to
it, so it has to be reachable from the public internet. A coturn on localhost, or on a
machine behind a home router, advertises a relay address Meta can never reach — and an
HTTP tunnel does not help, since TURN needs UDP.

**How it fails when missing.** Signalling still succeeds, so the call connects and the
agent sees a live call. Meta then receives no media and terminates it with
`status: FAILED` plus error `138021`/`138022`/`138023` (media receive timeout, transmit
timeout, or accepted-with-no-media). The row is finalized `failed`, so the conversation
renders the compact "Missed voice call" row rather than the audio card — even though an
agent did answer. `voipTurnCredentialService` logs a warning on every call placed
without TURN, and those Meta error codes now reach the call row, so both ends of the
symptom are greppable.

Without TURN the app falls back to public STUN, which does connect media on
NAT-friendly networks (same LAN, permissive router). That is fine for working on the
calling UI and misleading for anything else.

The relay is deployed from the deployment repo, which owns its config, its firewall
rules and a Deploy TURN button; it is deliberately not in this repo's compose file,
because a relay on a laptop cannot work. `.env.example` carries the copy-pasteable env
block for pointing local dev at an existing relay.

Only coturn's REST/HMAC scheme (`use-auth-secret`) is supported: per call the app mints
username `<unix-expiry>:<userId>:<wacid>` and password
`base64(HMAC-SHA1(TURN_STATIC_SECRET, username))`. coturn verifies the HMAC and that the
expiry is still in the future — nothing else. The `<userId>:<wacid>` suffix is therefore
log attribution, **not** replay protection: a leaked credential is usable by anyone until
it expires, and cannot be revoked early. What bounds the damage is the short TTL plus the
relay's own `denied-peer-ip` and quota settings.
