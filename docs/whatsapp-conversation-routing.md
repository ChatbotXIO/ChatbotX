# WhatsApp Conversation Routing (thread control)

Lets ChatbotX share one WhatsApp number with other responders — Meta's Business
Agent ("Meta AI") or another BSP/bot — under Meta's
[Conversation Routing](https://developers.facebook.com/documentation/business-messaging/whatsapp/conversation-routing/thread-control).
Meta decides who owns each thread; ChatbotX tracks that ownership locally, stops
its own Service replies while another responder owns the thread, lets agents
take over / release / pass, and shows the handover context in the inbox.

Routing is configured by the **business in Meta Business Suite** (primary
responder per entry point, one escalation partner, standby grants). ChatbotX
never chooses its role. Support is **always on**: a number with a single
responder never receives routing traffic, so its threads stay `null` and behave
exactly like before.

## Where it lives

| Layer | Path |
|-------|------|
| Domain rules (states, transitions, idle rule, send gate, tie order) | `packages/database/src/partials/thread-control.ts` |
| Columns | `ContactInbox.threadControlState` / `threadOwnerRole` / `threadControlUpdatedAt` / `threadControlLastEvent`, `Inbox.threadControlSeenAt`, `IntegrationWhatsapp.handoverResumeFlowId` (migration `20260929022544_conversation_routing`) |
| Repositories | `contact-inbox` (`applyThreadControlTransition`, `listThreadControlledByContactIds`), `inbox` (`touchThreadControlSeen`), `integration-whatsapp` (`updateHandoverResumeFlow`) |
| Business | `packages/business/src/thread-control/` (`threadControlService`); `requestThreadControlAction` in `packages/channel-registry/src/thread-control.ts` (needs the registry, so it cannot live in business) |
| WhatsApp | `integrations/whatsapp/src/api/webhook.ts` (subscribed fields), `api/thread-control.ts` (`POST /{phone_number_id}/thread_control`), `handlers/webhook.ts` (`extractConversationRoutingPayloads`), `lib/conversation-routing.ts` (parsers, template echo rendering), `handlers/conversation.ts` (`updateThreadControl`, `receiveThreadControlEvent`) |
| Queue | `IntegrationJobAction.threadControlEvent`, `IntegrationJobAction.threadControlAction` (`packages/worker-config`) |
| Worker | `apps/worker/src/integration/handlers/thread-control.ts` (both jobs), `thread-control-inbound.ts` (inbound hook), send gate in `chat/handlers/send-message.ts`, rejection reconciler `chat/handlers/whatsapp-thread-control-rejection.ts`, flow step `stepThreadControl` |
| Builder | `features/conversations/` (`useThreadControl`, `thread-control.action.ts`, pill / release / pass), `features/messages/components/thread-control-*` (locked composer, divider, context card), `features/contacts/components/contact-thread-control-section.tsx`, `features/integration-whatsapp/components/conversation-routing-card.tsx` |

## Ops setup

1. **Apply the migration** (`pnpm --filter @chatbotx.io/database db:migrate`) —
   additive, nullable columns only, no backfill.
2. **Meta enrollment.** The app must be enrolled for thread control by Meta.
3. **App Dashboard** → WhatsApp → Webhooks: subscribe the app to the
   `messaging_handovers` and `standby` fields (one time). Subscribing is inert
   until a business configures routing.
4. **Backfill the per-WABA subscription** once after deploy:
   `pnpm --filter worker backfill:whatsapp-webhook-fields`
   (`apps/worker/scripts/resubscribe-whatsapp-webhook-fields.ts`). It
   subscribes one call per Meta subscription (WABA + calling app id,
   `auth.clientId`), tries the
   reconnect field set (`automatic_events` included) plus
   the routing fields first and, if Meta rejects that, retries once with the base
   set plus the routing fields. A failing WABA is logged and the run continues;
   the process exits `1` if any WABA failed. It is idempotent, so a re-run is
   safe. It only matters for numbers connected before this release: new connects
   and reconnects always add the routing fields (`subscribeWebhook`).
   **Manual-connect numbers** (the customer's own Meta app) are re-subscribed
   with their own token and stored callback override (`metadata.webhookUrl` +
   `verifyToken`, exactly as manual connect does), so their callback is kept.
   Step 3 does not cover them: the customer must subscribe their own app to
   `messaging_handovers` and `standby` in their App Dashboard (and be enrolled
   by Meta) before routing traffic reaches ChatbotX.

**Rollback:** there is no runtime switch; rolling back is a code revert.
Subscriptions to `messaging_handovers` / `standby` are left in place and are
inert without the handlers.

## States

`ContactInbox.threadControlState` is one of `owned` (ChatbotX answers), `standby`
(another responder owns the thread; ChatbotX only listens), `idle`, or `null`
(routing never observed — today's behaviour everywhere).

Every event maps to exactly one state (`THREAD_CONTROL_TRANSITIONS`):

| Event | Source | → State |
|-------|--------|---------|
| `inboundReceived` | customer message on field `messages` (we are the receiver, so the owner) | `owned` |
| `controlPassed` | `messaging_handovers` `control_passed` (handed to us) | `owned` |
| `taken` | our `take` call | `owned` |
| `serviceSent` | our Service send succeeded on an `idle`/`standby` thread (implicit take) | `owned` |
| `standbyReceived` | customer message on field `standby` | `standby` |
| `controlTaken` | `messaging_handovers` `control_taken` (taken from us) | `standby` |
| `passed` | our `pass` call | `standby` |
| `serviceRejected` | Meta rejected our Service send for ownership | `standby` |
| `released` | our `release` call | `idle` |

- **Idle is computed, never written by a cron.** A stored `owned`/`standby`
  resolves to `idle` once `max(lastIncomingMessageAt, threadControlUpdatedAt) + 24h`
  has passed (`resolveThreadControlState`). Counting from the transition time too
  keeps a handover that lands on a thread with an old last customer message (e.g.
  standby visibility off) from resolving to idle immediately.
- **Ordering.** `applyThreadControlTransition` is one guarded `UPDATE`: an event
  older than `threadControlUpdatedAt` is stale and rejected. On an equal
  timestamp (Meta sends seconds) the higher-precedence event wins —
  `inboundReceived < standbyReceived < serviceSent < serviceRejected < passed <
  released < taken < controlPassed < controlTaken` — and an exact redelivery is
  accepted idempotently. Our own events are stamped at whole seconds
  (`toThreadControlTimestamp`) so a same-second Meta handover still wins, and a
  take/release/pass is stamped when the request to Meta starts, so an event that
  lands while the call is in flight wins over it.
- **Single-responder numbers stay `null`.** `Inbox.threadControlSeenAt` records
  the last routing traffic (standby, handover, context, our own
  take/release/pass, a rejected send), refreshed at most once a day. A context-less
  owner delivery marks a thread `owned` only when the thread is already non-null
  or the inbox saw routing traffic in the last **30 days**; otherwise it writes
  nothing. The inbox reverts to single-responder behaviour 30 days after the
  business removes its routing config.
- Every visible state change writes one activity divider (deterministic
  `sourceId`, so redeliveries are idempotent). Every applied event invalidates
  the contact-inbox cache and publishes `contactInboxThreadControlUpdated` over
  realtime — even when the divider write fails (that error is still rethrown
  for the retry).

## Behaviour

**Send gate.** Both send chokepoints (`sendMessageToChannel`,
`sendFlowStepToChannel`) refuse a **Service** (non-template) send while the
resolved state is `standby`, before the API call, with a permanent
`PERMISSION_DENIED` `ChannelError` (code `thread_not_owned`): the message shows a
send error, `message:failed` is emitted and nothing retries. Templates
(`processWhatsappTemplate` → `isTemplateMessage: true`) always go through and
never change ownership. `idle`, `owned` and `null` threads go to Meta, which is
the authority. This is deliberately stricter than Meta: as escalation partner,
any automated Service send would be an implicit take, so taking over is always an
explicit human action.

**Standby suppression.** A `standby` delivery is stored (the contact is created
like a normal inbound) but runs **no** automation: no postback / quick reply /
template-flow / keyword / ref / AI routing. A WhatsApp call-permission answer is
still recorded (account state). If the same message later arrives on `messages`
(we became owner), the standby copy is promoted once (atomic claim on
`contentAttributes`) and the owner-side automation runs then.

**Owner deliveries are recorded before automation.** An owner delivery's
transition is written before the message is saved (and, for a promoted standby
copy, before the promotion claim). If that write fails the job fails and BullMQ
retries it: the message is still new (or the claim still unspent), so automation
runs exactly once and never against a stale `standby` lock. A failed standby
transition fails the job too; the retry records it for the stored copy (still
marked standby and unpromoted), so the composer and send gate close, and still
runs no automation. A clean standby redelivery is a no-op. Partner echoes
(`standby.message_echoes`) are stored as outgoing third-party messages labelled
"Partner" (dropped for an unknown contact); template echoes are rendered from the
template definition with the sent parameters. `standby.statuses` (other partners'
receipts) are dropped.

**Handover.** A `messaging_handovers` item becomes a `threadControlEvent` job
(5 attempts, 10 s exponential backoff, set at the webhook enqueue).
`control_passed` for an unknown contact creates the contact (we must answer);
`control_taken` for an unknown contact is dropped. A `conversation_context`
(`summary` text or `history` items) on `messages` or `control_passed`, and the
handover `metadata`, are shown verbatim as a context card ("Handover note") —
no LLM extraction.

**Resume flow.** One optional flow per WhatsApp number
(`IntegrationWhatsapp.handoverResumeFlowId`, set on the number's Settings tab, super
admin only). It is enqueued once per applied `control_passed` (not on a
Meta redelivery, never on our own `take`), with job id
`thread-resume-<contactInboxId>-<occurredAtMs>`; a BullMQ retry of the same
job (e.g. the enqueue failed after the event was recorded) still starts it, and
the deterministic job id keeps it exactly-once. **Residual limit:** Meta does not
redeliver a webhook we already answered with 200, so if every attempt fails
(e.g. Redis unavailable for longer than the ~2.5 min retry window) the resume
flow does not start — and if the failure came before the handover was recorded,
the handover is lost too; the conversation then waits for an agent. There is no
outbox for this by design. A deleted or inactive flow is
logged and skipped. End it with the **Thread Control → Release** step, otherwise
ChatbotX keeps the thread while the customer stays active and the other app
cannot answer.

**Archive release.** Archiving conversations (action, API, bulk) enqueues one
`threadControlAction` `release` job per WhatsApp thread still resolved as `owned`
for those contacts (job id `thread-release-<contactInboxId>-<updatedAtMs>`). No
Meta call happens inside archive; an enqueue failure is logged and the thread
idles out after 24 h. A permanent rejection (we no longer own it) is logged and
the job completes; a retryable error rethrows for BullMQ.

**Flow step `threadControl`** (`release` | `pass`), states `[success, error]`.
`pass` always targets Meta's default (the escalation partner). An unsupported
channel or any channel refusal follows the Error path with the reason; the step
never throws into a retry.

## UI surfaces

All render only for a conversation whose WhatsApp contact inbox
(`findContactInboxByChannel`) has a non-null resolved state, via one hook,
`useThreadControl`.

| Resolved state | List row | Header / menu | Composer | Side panel |
|---|---|---|---|---|
| `null` | unchanged | unchanged | unchanged | hidden |
| `idle` | — | — | normal | "No owner" |
| `owned` | brand pill | **Release** button; **Pass to escalation** in the conversation menu (hidden when our role is `escalation`) | normal | "Handled by <brand>" |
| `standby` | amber pill "Meta AI" / "Partner · <role>" | — | **locked** card with **Take over** and **Send flow**; lock applies only when the composer sends through WhatsApp | "Handled by <owner>" |

The "Bot is active" banner is hidden on `standby`. Take over / Release / Pass
(`thread-control.action.ts`) are allowed to anyone who can open the conversation
(contacts access + contact scope). A `take` refused with Meta error `2494191`
(only the escalation partner may take) is raised by the WhatsApp handler as the
channel-agnostic `ThreadControlTakeRefusedError` and shows an inline message,
keeping the lock; any other failure is a toast. After a successful take the
owner role is recorded as `escalation` (only escalation may take), so **Pass**
is hidden. The action result patches the store immediately; realtime updates other
tabs, and older snapshots are ignored. The settings card is always shown on the
WhatsApp settings page.

## Limits

- **R1 — rejection codes unknown.** Meta has not published the error code for a
  non-owner Service send, so `THREAD_CONTROL_REJECTION_CODES`
  (`integrations/whatsapp/src/lib/error-mapper.ts`) is empty and `serviceRejected`
  is never recorded yet. The local gate still blocks known-`standby` threads;
  only a rejection on a thread we believe `idle`/`owned`/`null` goes unrecognized
  (the send error is still shown). Add the code once captured from a real
  rejection.
- **No current-owner API.** Meta exposes no way to read the owner. The state is
  inferred from webhooks, our own calls and sends; with standby visibility off,
  ChatbotX does not see the partner's activity and the 24 h idle clock may lag.
- **One WhatsApp inbox per conversation.** A contact on two WhatsApp numbers
  shows the routing state of the inbox `findContactInboxByChannel` picks.
- **Up to 30 days of false positives** after a business removes its routing
  config: new threads can still show the brand pill / Release; a Release then
  fails with a permanent error that is logged.
- Our `pass` always goes to the escalation partner; no role picker. Partner
  read receipts, an inbox filter for partner-handled conversations and mobile
  app surfaces are out of scope.
- Numbers already registered on the Cloud API (`status: CONNECTED`,
  `platform_type: CLOUD_API`, e.g. shared via "Share existing WhatsApp phone
  numbers") are not re-registered on connect, so the other partner's PIN is kept.
- **Messenger same-second handover race.** Thread-control timestamps are floored
  to whole seconds (`THREAD_CONTROL_TIMESTAMP_RESOLUTION_MS`), and on a tie
  `controlTaken` outranks `controlPassed`. If a partner (e.g. Business AI) takes
  control and hands it back within the **same wall-clock second**, both events
  collapse to one timestamp and the later hand-back loses the tie: the thread
  stays `standby` and the handover resume flow does not start for that
  conversation. The next routing event re-syncs the state, and an agent can still
  take over manually. This is rare — an AI take→hand-back normally spans more than
  a second — and the second-resolution is deliberate: it keeps a Meta handover
  that lands in the same second as our own in-flight send winning by precedence,
  which is robust against our-clock-vs-Meta-clock skew (see the comments in
  `apps/worker/src/chat/handlers/send-message.ts` and
  `packages/business/src/thread-control/service.ts`). A future fix, if production
  shows sub-second hand-backs, is per-channel resolution: millisecond precision
  for Messenger's Meta **event** timestamps only (same-clock, so sub-second
  ordering is trustworthy there), keeping our own actions floored to seconds.
- **Ordering & finalization races under out-of-order delivery / queue lag / retries.**
  The routing state is eventually-consistent. Two properties produce rare, transient
  mis-states: (1) the write guard orders events by **second-resolution timestamps +
  precedence**, so a genuinely out-of-order Meta delivery, a no-op write that does not
  advance the stored timestamp, or an owner re-sync stamped at processing time can let
  an older event win or reject a newer one; (2) the state write commits **before** its
  side-effects (timeline divider, cache bust, inbox-seen marker, resume-flow enqueue),
  so a crash/retry between them can see "state already applied" and skip the unfinished
  finalization. Observable symptoms: for one conversation, for a short window, the lock
  state can be wrong, a resume flow or timeline divider can be missed, or the inbox
  routing marker can lag. **It is self-correcting** — the next routing event (an inbound
  message, the next handover, or the agent's "Sync owner" / manual take-over) recomputes
  the correct state; no data is lost. It needs specific interleavings (out-of-order
  delivery or a crash at an exact point) that are uncommon in normal operation where
  events arrive ordered and seconds apart. A full fix is an authoritative monotonic
  **revision** for ordering (instead of timestamps) plus **atomic state+finalization**
  (or a durable finalization-pending marker); that is a dedicated follow-up, deferred
  because it rewrites the core model and the current behaviour is correct for the common
  case. Track real incidence in production before investing in it.
