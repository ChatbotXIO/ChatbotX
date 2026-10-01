# Implementation Plan: WhatsApp Conversation Routing (thread control)

Status: **approved by owner (2026-09-29)**. Reviewed by Claude and Codex:
backend (APPROVE), UI/UX §3.7 (APPROVE), and the always-on / kill-switch revision
(APPROVE). The migration is generated but never applied without explicit owner approval.

Sources: Meta Conversation Routing docs (overview, entry points, thread
control, thread lifecycle, standby partners, get started — published
2026-09-23), the partner PDF "Conversation Routing — Partner Integration
Guide", the design PDF "WhatsApp Conversation Orchestration API", v1
(`chatbotai` Messenger BizAI handover), and the current v2 code (verified
2026-09-28).

---

## 1. Requirements

Build the full design (10 features) for **WhatsApp only**, extensible to other
channels later (Messenger handover) without rewrites.

### 1.1 Meta behaviour we must honour (verified in official docs)

| # | Fact | Consequence for us |
|---|---|---|
| M1 | A thread is `idle` or owned by exactly one responder. The responder that **receives** an inbound message on an idle thread becomes owner at that moment. | An inbound on field `messages` ⇒ we own the thread. |
| M2 | Only the owner may send **Service** (non-template) messages. Marketing/Utility/Authentication **templates** can be sent by anyone and never change ownership. An idle thread is **not** open: a non-owner Service send is rejected by the API. Exception: the escalation partner's Service send is an implicit `take`. | Block Service sends while another responder owns the thread; let templates through; let Meta decide on idle threads. |
| M3 | Thread returns to idle after **24 h of WhatsApp-user inactivity** (no webhook), or when the owner calls `release` (no webhook). CTWA ad clicks and marketing/utility template postbacks re-route the thread. | Idle is computed lazily from `lastIncomingMessageAt`; never trust a stored `owned` older than 24 h of user silence. |
| M4 | `POST /{phone_number_id}/thread_control` with `action` = `pass` \| `release` \| `take`, exactly one of `to` / `recipient` (BSUID, preferred), optional `metadata` (≤ 2000 chars), `pass` optional `control_pass.target_role` (`ai_agent`, `ctwa`, `customer_service`, `escalation`, `marketing`, `utility`; default escalation). Caller must own the thread (`take`: escalation only, else error `2494191`). Account must be enrolled for thread control. Success returns `{ messaging_product, request_id }`. | One integration handler with an `action` discriminator. |
| M5 | Webhook field `messaging_handovers`: `type` = `control_passed` (to the new owner, may carry `conversation_context`) or `control_taken` (to the previous owner). Both carry `previous_owner_role`, `new_owner_role`, `metadata`. The PDF also shows `previous_owner_app_id`. | Parse every optional field leniently; never require an app id. |
| M6 | Webhook field `standby` (only if the business granted standby visibility, off by default): `standby.messages[]` (+ `contacts[]`), `standby.message_echoes[]`, `standby.statuses[]`. A standby partner **must not reply**. Template echoes carry `message.template` (values) and a sibling `template` (definition with `{{n}}`). | Store inbound + echoes without automation. Render template echoes. |
| M7 | `conversation_context` arrives on `messages` and `control_passed`: `{type:"summary", summary:{text}}` (official) or `{type:"history", history:{items[]}}` (PDF; `sender_type` `user` → `message`, `business` → `message_echo.message`). Absent (not null) when not applicable. Meta: treat summary text as opaque. | One parser, both shapes, display only. |
| M8 | There is **no API that returns the current owner**. | Track locally from webhooks, our own actions, and rejected sends. |
| M9 | Routing is configured by the business in Meta Business Suite (primary per entry point, one escalation partner, standby grants). A partner cannot choose its role. | No role picker in our UI (drawing's radio is removed). |
| M10 | Routing is active only when the account has more than one responder **and** a routing configuration. Without it: *"All connected responders receive every inbound message … No standby traffic is sent — no partner receives standby echoes, and no partner receives a conversation summary."* (entry-points-and-routing) | Support is **always on**. For single-partner customers no routing traffic ever arrives, every state stays `null`, and behaviour is exactly today's. No per-number toggle is needed. |
| M11 | The owner keeps the thread as long as the user stays active. Stopping sends does not release it (360dialog BSP guide: the most common cause of a Business Agent "going silent"). | Our own bot replies keep the thread away from the partner/Meta AI. Hence archive auto-release (D6), the Release flow step, and settings/docs guidance to end a handover flow with Release. |

### 1.2 Product decisions (confirmed with owner)

- D1 Full design, WhatsApp only. Supports both "Meta Business Agent" (`ai_agent`) and other BSPs/bots as the other responder.
- D2 Role is not chosen in AhaChat. We display the owner role we observe. AhaChat is expected to be the escalation partner, but nothing assumes it.
- D3 Take over = explicit `take` API call, then unlock the composer. If Meta answers `2494191` (not escalation), show a toast and keep the lock.
- D4 While another responder owns the thread, every Service send is blocked with a visible send error. Templates always go through. Queued sends are **not** retried or delayed.
  - This is **deliberately stricter than Meta**. As escalation partner, any AhaChat Service send (a flow, sequence or AI reply) would be an implicit `take` and silently steal the thread from the partner.
  - A takeover must therefore always be an explicit human action (D3). After the take the state is `owned` and the gate is open.
- D5 Inbound on `standby` is stored (contact is created like a normal inbound) but runs **no** automation.
- D6 Archiving a conversation releases every WhatsApp thread we own for that contact. New flow step "Thread control" (`release` | `pass`).
- D7 `pass` always targets the default (escalation). The handler type accepts an optional `targetRole` for later use.
- D8 The context card shows `summary.text` verbatim, or the history lines. There is no LLM extraction. `control_passed.metadata` is shown as "Handover note".
- D9 Other responder label: `ai_agent` → "Meta AI", otherwise "Partner · <role>".
- D10 Handover resume flow is one flow per WhatsApp number. It runs only on `control_passed`, never on our own `take`.
- D11 Anyone who can open the conversation (`requireContactsAccess` + contact scope) may take, release or pass. Routing settings are super-admin only (same as calling settings).
- D12 **No per-customer toggle** (M10). Support is always on, gated only by a **platform kill switch** env `WHATSAPP_CONVERSATION_ROUTING_ENABLED` (default `false`). Ops turn it on once Meta has enrolled the app.
  - **Off** means routing payloads are ignored (webhook drops them, handlers return `null`), which is exactly today's behaviour. Subscriptions are left as they are, and new connects stay on the base field list.
  - **Every off→on transition** is followed by the idempotent backfill script (§3.5.1), so numbers connected while off get subscribed.
  - The only per-number setting is the handover resume flow (D10).
  - **Update (2026-09-30):** the owner later removed the kill switch. `WHATSAPP_CONVERSATION_ROUTING_ENABLED` no longer exists and support is always on; the backfill runs once after deploy, and rollback is a code revert. Flag references elsewhere in this plan are historical.
- D13 Connecting a number shared with another partner ("Share existing WhatsApp phone numbers" in Embedded Signup): do not call `/register` on an already-registered number.
- D14 `standby.statuses[]` (receipts of other partners' messages) are acknowledged and dropped. This saves a `findBySourceId` shard scan per partner receipt, and the design does not show them.

---

## 2. Current code (verified)

| Area | Where | Fact |
|---|---|---|
| Webhook split | `integrations/whatsapp/src/handlers/webhook.ts` `parsePostPayloads` (:427) | Independent extractors (`extractCoexistPayloads`, `automaticEventFieldExtractors` registry :112, calls, `buildMessagesChangeBuffers` :358). `messaging_handovers` / `standby` are silently dropped today. |
| Enqueue | same file, `dispatchWebhookResult` (:897) | `integrationQueue`, deterministic `jobId`s, `REDELIVERABLE_JOB_OPTIONS`. |
| Subscribed fields | `integrations/whatsapp/src/api/webhook.ts` | `subscribeWebhook({auth, includeAutomaticEvents, overrideCallbackUrl})` posts a `subscribed_fields` list to `/{wabaId}/subscribed_apps`. Callers: `connect-steps.ts:37,194`, `connect-number.ts:269`, `reconnect.action.ts:222`. |
| Inbound parse | `integrations/whatsapp/src/handlers/message/incomming-message.ts:150` | Returns `ReceivedMessageResult` (`packages/sdk/src/lib/shared/index.ts:50`), which has `echoOrigin`. `data.raw` is the single-item body. |
| Inbound worker | `apps/worker/src/integration/handlers/received-message.ts:214` `receiveMessage` | Automation block :483–609 (postback, quick reply, template flow, outbound keyword, ref). Third-party echo for an unknown contact is dropped (:296). `detectContactAndConversation` is exported (:1700). |
| Inbound routing | `apps/worker/src/integration/worker.ts:170-266` + `routing.ts` | Keywords, AI agent, challenge. |
| Send chokepoints | `apps/worker/src/chat/handlers/send-message.ts` `sendMessageToChannel` (:96), `sendFlowStepToChannel` (:733) | Every WhatsApp send goes through one of these. Templates reach `sendFlowStepToChannel` only via `processWhatsappTemplate` (`send-whatsapp-template.ts:177`). Throwing a permanent `ChannelError` before the API call is recorded as `sendError`, emits `message:failed` and is not retried (precedent: `assertTemplateAllowedForContactInbox`, `send-whatsapp-template.ts:71`). |
| Error mapping | `integrations/whatsapp/src/lib/error-mapper.ts` | Code sets → `ChannelErrorCategory`. `PERMISSION_DENIED` is permanent. |
| Send-error hook | `apps/worker/src/chat/handlers/channel-send-error-reconcilers.ts` | Per-channel reconciler map (whatsapp → call permission). |
| Per-thread row | `packages/database/src/schema/contact-inbox.ts` | One row per (inbox, end user), `lastIncomingMessageAt`. `Conversation` is one row **per contact** (across inboxes), so it is not the right home. |
| WA settings | `packages/database/src/schema/integration-whatsapp.ts` | Typed columns (`coexistEnabled`, `callRecordingEnabled`, …). Flow FK precedent: `welcomeFlowId` in `integration-messenger.ts:77`. |
| Activity rows | `apps/worker/src/integration/handlers/shared/whatsapp-call-finalize.ts:329` | `senderType:"system"`, `messageType:"activity"`, deterministic `sourceId`. The builder renders non incoming/outgoing as a centred divider (`message-item.tsx:108`). Cards are rendered via `RenderContentAttributes` (`message-item.tsx:622`, e.g. `WhatsappCallCard`). |
| Start a flow | `IntegrationJobAction.sendFlow` (`packages/worker-config/src/queues/integration/index.ts:188`) | Canonical producer: `apps/worker/src/trigger/services/action-executor.ts:215`. |
| Step pattern | `packages/flow-config/src/steps/auto-assign-conversation.ts` + `handleSendMetaCapiEventStep` | `[success, error]` states. Unsupported channel → `error`. |
| Channel handler call | `packages/sdk/src/lib/integration.ts` `runChannelHandler` (:535); `resolveIntegrationContextFromContactInbox` (`packages/channel-registry/src/registry.ts:296`, already used by `packages/business/src/contact-scan/service.ts`) | Throws `IntegrationException` when a handler is not registered. |
| Archive | `packages/business/src/conversation/service.ts` `updateArchived` (:649) | Covers the action, the API and bulk archive. |
| Realtime | `packages/partysocket-config/src/schemas.ts`, `publishToWorkspaceParty` (`packages/business/src/platform/realtime-broadcast.ts:261`), `apps/builder/src/features/chat/chat-realtime.tsx` | Conversation state lives in Zustand (`chat-store.ts`). The side panel uses TanStack. |
| Inbox UI | `conversations/conversation-item.tsx` (badges :333), `messages/message-head.tsx`, `messages/components/message-input.tsx` (lock branches :388/:400), `contacts/contact-inbox-panel.tsx` (`accordionModules` :131), `whatsapps/[id]/settings/page.tsx` (cards) | Extend these; no new pages. |
| Register on connect | `apps/builder/src/features/integration-whatsapp/actions/connect-steps.ts` `registerIfNeeded` + `integrations/whatsapp/src/api/waba-setup.ts:153` `registerPhoneNumber` | Skips only coexist numbers today. |

Industry check (2026-09-29):
- **Chatwoot** implements `standby`/`messaging_handovers` only for Facebook/Instagram (`lib/integrations/facebook/message_parser.rb` branches on `messaging` vs `standby`). It has no WhatsApp thread control, and bot/human ownership is an always-on conversation status (`pending` = bot, `open` = human).
- **360dialog** documents Meta Business Agent handoff for BSPs as always-on infrastructure. Its advice: branch by webhook field, dedupe standby by message id, always `release` when done, and prefer explicit `take`.
- **respond.io** and **Twilio** layer their own always-on ownership/handover UX with an AI summary on handover.
- **Nobody exposes a customer toggle.** This confirms D12, the explicit Take over (D3), the context card (D8) and release-on-archive (D6).

v1 lessons (Messenger BizAI, `chatbotai/app/Services/MetaBusinessAi/*`): an owner state plus a transition log, guarded duplicate-free writes and a realtime broadcast worked well. Matching handover by a hard-coded **metadata text** (`MessageHandover.php:40`) is fragile, so we branch on webhook fields and `type` only.

---

## 3. Design

### 3.1 State model — `packages/database/src/partials/thread-control.ts` (new; the domain rules live in one place)

Channel-agnostic names, so Messenger handover can reuse them later.

```ts
export const threadControlStates = z.enum(["owned", "standby", "idle"])
export const threadControlRoles = z.enum([
  "ai_agent", "ctwa", "customer_service", "escalation", "marketing", "utility",
])
export const threadControlActions = z.enum(["take", "release", "pass"])
export const threadControlEvents = z.enum([
  "inboundReceived",   // we got the user's message as owner (M1)
  "standbyReceived",   // we got the user's message on standby
  "controlPassed",     // handover to us
  "controlTaken",      // someone took it from us
  "taken", "released", "passed", // our own thread_control calls
  "serviceSent",       // our Service send succeeded on a non-owned thread (implicit take)
  "serviceRejected",   // Meta rejected our Service send for ownership
])

// Strategy map: every event has exactly one resulting state.
export const THREAD_CONTROL_TRANSITIONS: Record<ThreadControlEvent, ThreadControlState> = {
  inboundReceived: "owned", controlPassed: "owned", taken: "owned", serviceSent: "owned",
  standbyReceived: "standby", controlTaken: "standby", passed: "standby", serviceRejected: "standby",
  released: "idle",
}

export const THREAD_IDLE_AFTER_MS = 24 * 60 * 60 * 1000
/** An inbox counts as multi-responder while routing traffic was seen within this window (§3.2). */
export const THREAD_CONTROL_INBOX_ACTIVE_MS = 30 * 24 * 60 * 60 * 1000
/** Refresh Inbox.threadControlSeenAt at most once per this interval (bounds writes to ~1/day/inbox). */
export const THREAD_CONTROL_SEEN_REFRESH_MS = 24 * 60 * 60 * 1000
export function isInboxThreadControlActive(seenAt: Date | null, now: Date): boolean

/**
 * Total order used only to break a same-timestamp tie (§3.3), lowest first.
 * Meta's explicit handovers outrank our own calls, which outrank inferred states.
 */
export const THREAD_CONTROL_EVENT_PRECEDENCE: readonly ThreadControlEvent[] = [
  "inboundReceived", "standbyReceived", "serviceSent", "serviceRejected",
  "passed", "released", "taken", "controlPassed", "controlTaken",
]

/** Events that lose a tie against `event` (strictly lower precedence). */
export function eventsOutrankedBy(event: ThreadControlEvent): ThreadControlEvent[]

/** M3: a stored state is idle once 24h passed since the later of `lastIncomingMessageAt` and `threadControlUpdatedAt`. null = routing never observed. */
export function resolveThreadControlState(input: {
  state: ThreadControlState | null
  lastIncomingMessageAt: Date | null
  threadControlUpdatedAt: Date | null
  now: Date
}): ThreadControlState | null

/** M2: only a known foreign owner blocks a Service send; idle/owned/null go to Meta. */
export function isServiceSendBlocked(input: {
  state: ThreadControlState | null
  lastIncomingMessageAt: Date | null
  threadControlUpdatedAt: Date | null
  isTemplateMessage: boolean
  now: Date
}): boolean
```

Idle is **computed**, never written by a cron (no job, no scan). A `released` event writes `idle` explicitly. The 24 h idle clock runs from the later of `lastIncomingMessageAt` and `threadControlUpdatedAt`, so a handover that arrives on a thread with an old last-seen user message (standby visibility off) does not resolve to idle immediately.

### 3.2 Schema (one migration, additive, nullable, so no backfill)

`ContactInbox` (`packages/database/src/schema/contact-inbox.ts`), following the `lastUserInputTypeEnum` pgEnum pattern:

- `threadControlState ThreadControlState NULL`. `null` means routing was never observed, which is today's behaviour everywhere.
- `threadOwnerRole text NULL`: the role of the **current owner**, validated through `threadControlRoles.safeParse` on write. An unknown role is stored as `null` (forward-compatible with new Meta roles).
- `threadControlUpdatedAt timestamp NULL`: the Meta event time of the last applied transition, used for ordering.
- `threadControlLastEvent ThreadControlEvent NULL` (pgEnum from `threadControlEvents`): the event that produced the current state. It is used for the tie order and for debugging.

`Inbox` (`packages/database/src/schema/inbox.ts`, channel-agnostic):

- `threadControlSeenAt timestamp NULL`: the last time routing traffic (standby, handover, context or rejected send) was seen on this inbox. A number counts as **multi-responder** while `threadControlSeenAt > now − THREAD_CONTROL_INBOX_ACTIVE_MS` (30 days, in the partial).
  - It decays on its own. If the business removes the Meta routing config, no more routing traffic arrives, and after 30 days the inbox reverts to "single-responder" behaviour: new threads stay `null`.
  - No operator action and no toggle are needed.
  - The false-positive window (≤ 30 days after a config removal) only shows the AhaChat pill / Release on new threads. A Release call then fails with a permanent error that is logged, which is harmless.

`IntegrationWhatsapp` (`packages/database/src/schema/integration-whatsapp.ts`):

- `handoverResumeFlowId bigintAsString NULL REFERENCES Flow(id)`, copying `welcomeFlowId` exactly (same `onDelete`, constraint naming, index).

No new table. The transition history is the activity messages (§3.6), which the inbox already shows. `pnpm --filter @chatbotx.io/database make:migration conversation-routing` generates the SQL. **It is not applied without owner approval.** `db:check-drift` must pass.

### 3.3 Data access

`packages/database/src/repositories/contact-inbox/repository.ts` gets two methods:

- `applyThreadControlTransition({ id, workspaceId, state, ownerRole, occurredAt })`: a single guarded `UPDATE … SET state, role, threadControlUpdatedAt = $occurredAt … RETURNING`:
  - `SET` also writes `threadControlLastEvent = $event`.
  - `WHERE id = $id AND workspaceId = $ws AND (threadControlUpdatedAt IS NULL OR threadControlUpdatedAt < $occurredAt OR (threadControlUpdatedAt = $occurredAt AND (threadControlLastEvent = ANY($outrankedEvents) OR (threadControlLastEvent = $event AND threadControlState = $state AND threadOwnerRole IS NOT DISTINCT FROM $role))))`.
  - `$outrankedEvents = eventsOutrankedBy(event)` is a parameterized array.
  - **Tie rule:** Meta webhook timestamps have second resolution. On an equal timestamp:
    - the event with higher `THREAD_CONTROL_EVENT_PRECEDENCE` wins,
    - an exact redelivery (same event, state and role) is accepted as idempotent,
    - anything else is rejected as stale.
  - This is a total order, so the final state does not depend on processing order.
  - Every **non-stale** event advances `threadControlUpdatedAt`, even when the state is unchanged, so a later-arriving older event can never overwrite a newer same-state one.
  - Returns the updated row, or `null` when the event was stale.
  - Drizzle query builder only, parameterized.
- `listThreadControlledByContactIds({ workspaceId, contactIds })`: one query for archive-release returning rows with `threadControlState = 'owned'` plus `lastIncomingMessageAt`. The service keeps only rows whose `resolveThreadControlState` (fed `lastIncomingMessageAt` and `threadControlUpdatedAt`) is still `owned`, so expired threads are never released.

The inbox repository gets `touchThreadControlSeen({ workspaceId, inboxId, seenAt })`: one guarded `UPDATE … SET threadControlSeenAt = $at WHERE id AND workspaceId AND (threadControlSeenAt IS NULL OR threadControlSeenAt < $at − THREAD_CONTROL_SEEN_REFRESH_MS)`, idempotent and throttled in SQL.

`packages/database/src/repositories/integration-whatsapp/repository.ts` gets `updateHandoverResumeFlow`, mirroring `updateCallSettings` (:713).

### 3.4 Business service — `packages/business/src/thread-control/service.ts` (new, exported from the package index)

This is the single owner of the rules. It is called by worker and builder alike.

```ts
recordEvent(input: {
  workspaceId: string
  inbox: Pick<InboxModel, "id" | "threadControlSeenAt">
  contactInbox: ContactInboxModel
  conversationId: string
  event: ThreadControlEvent
  ownerRole?: ThreadControlRole | null
  occurredAt: Date
  context?: ThreadControlContext
  handoverNote?: string
}): Promise<{ eventApplied: boolean; stateChanged: boolean }>
```

1. `next = THREAD_CONTROL_TRANSITIONS[event]`, then `repository.applyThreadControlTransition`.
   - When the event is **routing traffic** (every event except `serviceSent`, and except `inboundReceived` without a context) and the in-memory `inbox.threadControlSeenAt` is older than `THREAD_CONTROL_SEEN_REFRESH_MS` (or null), also call `touchThreadControlSeen`. That is at most about one write per inbox per day.
   - An `inboundReceived` carrying a context counts as routing traffic.
   - Inbox identification is uncached (`packages/channel-registry/src/registry.ts:206`), so no cache invalidation is needed.
2. `eventApplied = row !== null`.
3. `stateChanged = eventApplied && (previous resolved state, previous role) of the caller's in-memory row ≠ (next, role)`.
4. Returns `{ eventApplied, stateChanged }`.
5. Only `stateChanged` writes the divider and publishes realtime. A race between two writers at most yields one extra idempotent divider, which is keyed by `sourceId`.
6. If stateChanged:
   - invalidate `contacts:${contactId}:contact-inboxes` (same tag as `setPersona`),
   - write one activity message: `contentAttributes {type:"threadControl", event, ownerRole, previousOwnerRole?}`, `sourceId = thread-control:<contactInboxId>:<event>:<occurredAtMs>` via `createOrUpdate`, so a redelivery is idempotent,
   - publish realtime `contactInboxThreadControlUpdated`.
7. If `context` is present and `eventApplied` (whether or not the state changed), write one card message: `contentAttributes {type:"threadControlContext", context, handoverNote}`, with a `sourceId` derived from the triggering event, so it is idempotent.

```ts
requestAction(input: {
  workspaceId: string
  contactInboxId: string
  action: ThreadControlAction
  actorUserId?: string
}): Promise<ThreadControlSnapshot>
```

1. Load the contact inbox (workspace-scoped).
2. `resolveIntegrationContextFromContactInbox`.
3. `integration.hasChannelHandler("conversation","updateThreadControl")`. If it is missing, throw `ThreadControlUnsupportedError`.
4. `runChannelHandler("conversation","updateThreadControl", { ctx, data: { contact, action } })`.
5. On success, `recordEvent` with `taken` / `released` / `passed` (`occurredAt = now`), then return the snapshot from the updated row. If the event was stale, return the current row.
6. On a `ChannelError`, rethrow it unchanged. Callers map it for the UI (toast) or the flow (`error` state). The state is not changed on failure.

```ts
releaseOwnedThreadsForContacts({ workspaceId, contactIds }): Promise<void>
```

Uses `listThreadControlledByContactIds` and filters to rows still resolved as `owned`, then enqueues one `threadControlAction` integration job per row with `jobId thread-release-<contactInboxId>-<updatedAtMs>`. There is no API call inside archive.

`packages/business/src/integration-whatsapp/service.ts` gets `updateHandoverResumeFlow({ workspaceId, integrationId, handoverResumeFlowId: string | null })`:

1. Validate that a non-null flow belongs to the workspace and is active (`flowService.findActiveById`). If it does not, throw a typed not-found error.
2. Update through the repository, then invalidate the integration cache the same way `updateCallSettings` does.

### 3.5 WhatsApp integration

#### 3.5.1 Subscription — `integrations/whatsapp/src/api/webhook.ts`

- Add `WHATSAPP_CONVERSATION_ROUTING_FIELDS = ["messaging_handovers", "standby"] as const`.
- Add `isConversationRoutingEnabled()` in the same module. It reads `process.env.WHATSAPP_CONVERSATION_ROUTING_ENABLED === "true"`, the same style as `WHATSAPP_OVERRIDE_CALLBACK_URI` (:44).
  - Declare the variable in the worker and builder env schemas (`apps/worker/src/env.ts` and the builder equivalent) and in `.env.example`.
- `subscribeWebhook` appends `WHATSAPP_CONVERSATION_ROUTING_FIELDS` to whatever list it already sends (base, or base + automatic events) when the flag is on. The signature is unchanged, so connect, embedded connect and reconnect all pick it up with no caller change.
- **Existing numbers:** add the one-off, idempotent script `apps/worker/scripts/resubscribe-whatsapp-webhook-fields.ts`, exposed as `pnpm --filter worker backfill:whatsapp-webhook-fields` (same shape as `packages/database/scripts/backfill-*.ts`).
  - It pages through connected WhatsApp integrations 50 at a time (the `refresh-whatsapp-tokens.ts` batching) and calls `subscribeWebhook`.
  - **Field policy:** there is no stored per-row record of `automatic_events`. Connect subscribes without it, reconnect (`reconnect.action.ts:222`) always with it. The script therefore first tries reconnect's set (`includeAutomaticEvents: true`, plus routing fields).
  - If Meta rejects that call for a row, the script retries once with the base set plus routing fields, so a row never loses routing and never gains a field Meta refuses.
  - A per-row failure is logged and the script continues. It ends with a summary count.
  - It exits early when the flag is off.
  - Ops run it once after turning the flag on (§7).
- **App-level subscription** (App Dashboard → WhatsApp → Webhooks: `messaging_handovers`, `standby`) is a one-time ops step (§7). Per Meta, subscribing is inert until a business configures routing (M10).

#### 3.5.2 Webhook extraction — `integrations/whatsapp/src/handlers/webhook.ts`

Add one extractor, registered alongside the others in `parsePostPayloads`: `extractConversationRoutingPayloads(rawBody, pinnedPhoneNumberId)`.

**Every** routing item goes to one new job, `IntegrationJobAction.threadControlEvent`, and **never** to `incomingMessage` directly. When `isConversationRoutingEnabled()` is false the extractor returns nothing: exactly today's behaviour, where these fields are silently ignored. No DB access is needed.

The extractor splits items with a field/key → splitter map (no if-chains):

| Field / key | One job per | `payload.kind` | `jobId` |
|---|---|---|---|
| `messaging_handovers` | `value` | `handover` | `wa-tc-<phone>-<sha256(value)>` |
| `standby.messages[]` | message, re-wrapped like `buildMessagesChangeBuffers` (reuse `splitMessagesChangeValue` / `pickContactsForMessage`), raw body keeps `field:"standby"` | `standbyMessage` | `wa-sb-<phone>-<wamid>` |
| `standby.message_echoes[]` | echo, raw body keeps `field:"standby"` | `standbyEcho` | `wa-sbe-<phone>-<echoId>` |
| `standby.statuses[]` | dropped with one `logger.debug` count (D14) | — | — |

- Job data is `{ integrationType:"whatsapp", integrationIdentifier: phoneNumberId, payload: { kind, body } }`.
- `standbyMessage` / `standbyEcho` bodies are the same `whatsappWebhookEventSchema` shape (`phoneID, from, message, name, raw`) that the SDK `on.message` callback produces today, built directly from the split item, because the SDK middleware only handles `messages`.
- Distinct `jobId` prefixes mean a standby job can never swallow an owner (`wa-msg-`) delivery.
- Meta delivers each user message to an app in exactly one role. If the same wamid ever arrived both ways, `createOrUpdate` keeps one row and automation runs only for the first (owner) delivery. This is accepted and covered by a test.
- Pinned-number filtering reuses `dropMismatchedPhoneNumberId`.
- Enqueue order: after message/status jobs, before coexist.

#### 3.5.3 Parsing — `incomming-message.ts` (+ one lib file)

`receiveMessage` reads `raw.entry[0].changes[0].field` and `value.conversation_context`, and adds:

```ts
threadControl?: { delivery: "owner" | "standby"; context?: ThreadControlContext }
```

to `ReceivedMessageResult`. The type and its zod schema are added next to `echoOrigins` in `packages/sdk/src/lib/shared/message.ts`, channel-agnostic.

- `threadControl` is set only when `isConversationRoutingEnabled()` is true. With the flag off, the parse result of a `messages` delivery is exactly today's. With the flag on, every `messages` delivery carries `delivery:"owner"`. Whether that writes anything is decided in §3.6.
- **Echoes:** `messageType:"outgoing"`, `echoOrigin: thirdParty` (reuses the existing unknown-contact drop), `contentAttributes.threadControlEcho = true` for the UI label.
- **Template echo text:** `renderTemplateEcho(definition, sentComponents)` substitutes `{{n}}` in the BODY/HEADER text with the sent parameters in order. A media header becomes a `[image]` style prefix, and a missing definition falls back to the template name. This lives in the new `integrations/whatsapp/src/lib/conversation-routing.ts`, together with:
  - `parseConversationContext(value): ThreadControlContext | undefined` (zod; summary and history; an invalid shape logs a warning and returns `undefined`),
  - `parseHandoverEvent(value): ThreadControlWebhookEvent | null`.

#### 3.5.4 Channel handlers — `integrations/whatsapp/src/handlers/conversation.ts`

`packages/sdk/src/lib/integration.ts` `ConversationHandlers` gains two optional handlers:

```ts
updateThreadControl?: Handler<
  { ctx; data: { contact: OutgoingContact; action: ThreadControlAction; targetRole?: ThreadControlRole; metadata?: string } },
  void>
receiveThreadControlEvent?: Handler<
  { ctx; data: { integrationType: string; integrationIdentifier: string; payload: unknown } },
  ThreadControlWebhookResult | null>
```

```ts
type ThreadControlWebhookResult =
  | { kind: "handover"; event: ThreadControlWebhookEvent }
  | { kind: "standbyMessage"; receivePayload: unknown } // handed unchanged to receiveMessage
```

- `ThreadControlWebhookEvent` is `{ contact: IncomingContact; event: "controlPassed" | "controlTaken"; previousOwnerRole; newOwnerRole; handoverNote?; context?; occurredAt: Date }`.
- The WhatsApp handler also returns `null` when `isConversationRoutingEnabled()` is false (defence in depth for jobs queued before a flag flip). The decision stays inside the channel, and the shared worker never reads a WhatsApp setting.
- `standbyMessage` covers both `standbyMessage` and `standbyEcho` payload kinds.

`Integration` also gets `hasChannelHandler(group, name): boolean`, reusing the same lookup as `runChannelHandler`, so callers can check support without try/catch.

WhatsApp implementation:

- `updateThreadControl` POSTs `/{phone_number_id}/thread_control`. The recipient comes from `resolveRecipientParams` (BSUID when present, else `to`). It posts through the same `ky`/`rescue` path and `mapToChannelError` as other API calls.
- `error-mapper.ts`: add `2494191` to `PERMISSION_DENIED_CODES`.
- Also add `THREAD_CONTROL_REJECTION_CODES` (non-owner Service send; the code is not published, see §6 R1) to `PERMISSION_DENIED`.

### 3.6 Worker

**Inbound** (`received-message.ts`), after the contact inbox is resolved and the message saved (`isNewMessage`, and only when `parsedMessage.threadControl` is present):

- `delivery:"owner"` → `threadControlService.recordEvent("inboundReceived")` when the in-memory resolved thread state is not already `owned` **and** either:
  - the thread state is non-null, or
  - `isInboxThreadControlActive(inbox.threadControlSeenAt, now)` (a multi-responder number, M1: whoever receives owns), or
  - the delivery carries a context.

  Uses the `inbox` row that `receiveMessage` already loads. Consequences:
  - A single-responder number never sees routing traffic, so its threads stay `null`, it costs **zero** extra queries, and its UI is unchanged (M10).
  - On a multi-responder number, AhaChat-owned threads show "AhaChat" with Release/Pass, and archive-release works (M11), from the first inbound after routing traffic was seen.
- `delivery:"standby"` → `recordEvent("standbyReceived")` unless the in-memory resolved state is already `standby`.
- `context` → passed to the same `recordEvent` call. If there is no state change, `recordEvent` is still called for the card.
- `suppressAutomation = parsedMessage.threadControl?.delivery === "standby"`:
  - It skips the automation block (:483–609) with one early guard, not per-branch checks.
  - It is returned to `worker.ts`, which sets routing to `none` before `resolveIncomingTextRouting`.
  - An echo (outgoing) never triggers automation either.

**Handover job** — new `apps/worker/src/integration/handlers/thread-control.ts` (one file for both new job types), wired in `worker.ts`. It inherits the blocked-owner guard at `worker.ts:159`.

`threadControlEvent`:

1. `identifyInboxAndIntegrationAuthFromIdentifier`.
2. `runChannelHandler("conversation","receiveThreadControlEvent")`. A `null` result (routing off, malformed) is logged at debug and dropped.
3. A result dispatches through a `kind` → handler map:
   - `standbyMessage` → the existing `receiveMessage({ integrationType, integrationIdentifier, payload: receivePayload })`. The same pipeline, contact creation, echo drop and dedupe apply. The parser marks it `delivery:"standby"`, so automation is suppressed.
   - `handover` → steps 4–7.
4. Resolve the contact inbox with the existing phone-then-BSUID fallback used by `message-status.ts:42`.
5. If it is missing:
   - `controlPassed` → `detectContactAndConversation` (we must answer),
   - `controlTaken` → drop with a debug log.
6. `recordEvent(controlPassed → owner role = newOwnerRole | controlTaken → newOwnerRole)`.
7. On `controlPassed` with `eventApplied` and `handoverResumeFlowId` set → `flowService.findActiveById`. If the flow is active, enqueue `IntegrationJobAction.sendFlow` with the exact `contactInboxId` and `jobId thread-resume-<contactInboxId>-<occurredAtMs>`. A deleted or inactive flow is logged and skipped.

`threadControlAction` (archive-release): calls `threadControlService.requestAction`.
- A permanent `ChannelError` (e.g. we no longer own the thread) is logged and the job completes.
- A retryable error rethrows (default 2 attempts).

**Send gate** (`send-message.ts`, both chokepoints, one shared private function `assertThreadOpenForServiceMessage(contactInbox, { isTemplateMessage })`):

- If `isServiceSendBlocked(...)`, throw `new ChannelError(message, PERMISSION_DENIED, { code: THREAD_NOT_OWNED_ERROR_CODE })` before the API call. The existing path records `sendError`, emits `message:failed`, and does not retry.
- `sendFlowStepToChannel` gains `isTemplateMessage?: boolean`. Only `processWhatsappTemplate` passes `true`. `sendMessageToChannel` never sends templates.
- After a successful non-template send, if the in-memory state is `idle`/`standby` (non-null; a `null` thread is never touched), call `recordEvent("serviceSent")`. An escalation implicit take therefore updates the UI, and the owned steady state costs nothing.

**Rejected send**: add a WhatsApp reconciler entry in `channel-send-error-reconcilers.ts`. When `error.code ∈ THREAD_CONTROL_REJECTION_CODES`, call `recordEvent("serviceRejected")` and return `false`, so the error is still recorded on the message.
- Today the reconciler runs only in `sendMessageToChannel`'s catch (`send-message.ts:322`). `sendFlowStepToChannel` (:733) has no catch.
- Add one `try/catch` around its `runChannelHandler` call that invokes the same `reconcileChannelSendError`, then rethrows the original error unchanged, so the existing `send-flow-step.ts` failure handling is untouched.
- Both chokepoints thus share one reconciliation path.
- If the reconciler input does not already carry the contact inbox and conversation id, extend that input type once (both are in scope at both call sites). Do not re-query.
- Tests: rejection via direct send and via flow send.
- The gate reads the contact inbox row that both chokepoints already load for `resolveIntegrationContextFromContactInbox`. Verify during implementation that the load selects the new columns (full-row select). Do not add a second query.

**Flow step** `threadControl`:

- Schema `packages/flow-config/src/steps/thread-control.ts`: `{ action: z.enum(["release","pass"]) }`, states `[success, error]`, following `auto-assign-conversation.ts`.
- Handler registered in `flowStepHandlers` (`step.ts:415`), `STEP_PRODUCES_MESSAGE = false`. It calls `requestAction`:
  - an unsupported channel or a `ChannelError` returns `{ status: "error", errorMessage }`,
  - otherwise it returns `success`.
- This is a **step type**, so AGENTS invariant #16 (node cascade) does not apply. The step surfaces to register are:
  1. `stepTypes`
  2. schema file
  3. `flow-config` index export
  4. `shared.ts` action group
  5. `STEP_PRODUCES_MESSAGE`
  6. `flowStepHandlers`
  7. builder `allSteps` + `steps/thread-control/{index.ts,editor.tsx,viewer.tsx}`
  8. `perform-action/menu.tsx`
  9. i18n
- Grep `setMessengerPersona` to catch any registration surface missed from this list.

**Queue types**: `packages/worker-config/src/queues/integration/index.ts` adds `threadControlEvent` (same data shape as `IntegrationJobReceiveMessage`) and `threadControlAction` (`{ workspaceId, contactInboxId, action }`).

### 3.7 Builder — UI/UX (final)

#### 3.7.1 Principles

- **Zero change without routing traffic.** Every surface below renders only for a WhatsApp contact inbox whose resolved state is non-null, which only happens once Meta sends routing traffic for that thread (M10). Single-partner customers and a disabled kill switch see today's UI exactly.
- **One source of truth.** A single hook, `useThreadControl(conversation)` in `features/conversations/hooks/use-thread-control.ts`, is used by the list, header, composer and panel. Every surface reads the same thing:
  - `contactInbox`: resolved with `findContactInboxByChannel(conversation, channelTypes.enum.whatsapp)`, the helper `message-head.tsx:67` already uses. It never relies on array position, and no routing UI renders when there is no WhatsApp inbox. A contact on two WhatsApp numbers uses the helper's pick, which is documented as a known limit.
  - The **composer lock** additionally requires that the composer's own send channel (`channel` at `message-input.tsx:292`) is `whatsapp`, so a Messenger reply is never locked by WhatsApp routing.
  - `state`: `resolveThreadControlState` from the shared partial. The hook schedules one timer for the earlier of the 24 h idle boundary and the next minute boundary (for the relative "Since" text), and clears it on unmount. It does not reuse the composer's window clock.
  - `ownerLabel`,
  - `canRelease` / `canPass` / `isLocked`.
- **Owner label** is a strategy map over `threadOwnerRole`:
  - own states → "AhaChat",
  - `ai_agent` → "Meta AI",
  - any other role → "Partner · <role>", e.g. "Partner · Customer service",
  - `null` → "Partner".
- **Semantic colour + icon + text**, never colour alone:
  - AhaChat owner: `primary` tone, `HeadsetIcon`,
  - partner/standby: `amber` warning tone (same token family as existing warnings), `BotIcon`,
  - idle: muted.
- No new design primitives. Use `Badge`, `Button`, `Alert`, `Tooltip`, `AlertDialog` and the `Card` already used on the settings page.
- All strings live in a new top-level i18n namespace `conversationRouting.*` (channel-agnostic). Existing `fields.*` / `actions.*` keys are reused where one fits (`actions.send`, `actions.sendFlow`, `actions.cancel`).

#### 3.7.2 State → surface matrix

| Resolved state | List row | Header | Composer | Side panel | "Bot is active" banner |
|---|---|---|---|---|---|
| `null` (no routing traffic / kill switch off) | today | today | today | hidden | today |
| `idle` | nothing | nothing | normal composer | "No owner" | today |
| `owned` | pill **AhaChat** (primary) | **Release** button + **Pass to escalation** in `ConversationAction` menu | normal composer | "Handled by AhaChat" | today |
| `standby` | pill **Meta AI** / **Partner** (amber, tooltip = full owner label) | nothing extra | **locked card** (below) | "Handled by <owner>" | **hidden** (the bot is suppressed, so the banner would be misleading) |

#### 3.7.3 Conversation list row (`conversation-item.tsx`)

The bottom-left slot (:334) becomes a small flex group: `[AdBadgePill?][RoutingPill?]`.

- The pill copies the `AdBadgePill` sizing (10 px, rounded, outline) with its own style constant.
- There is no extra query: the fields come from the list payload (§3.7.9).

```
│ (K) Khánh                              18:00 │
│ Cho mình hỏi gói Pro…                        │
│ [Ads] [🤖 Meta AI]                  2m       │
```

#### 3.7.4 Header (`message-head.tsx`), state `owned`

- **Release**: `Button variant="outline" size="sm"`, `CircleCheckIcon`, label "Release" (icon-only below `md`, with a tooltip). Placed before the transfer-to-bot button.
  - No confirm: it is non-destructive, because the next customer message re-routes the thread.
  - Loading → disabled + spinner.
  - Success → toast "Conversation released".
- **Pass to escalation**: an item in `ConversationAction`'s menu, because it is rarer and hands the thread away.
  - It opens an `AlertDialog`: "Hand this conversation to your escalation partner? AhaChat will stop replying until the thread comes back."
  - Buttons: [Cancel] [Pass].
  - The item is hidden when the owner role is `escalation`, since AhaChat itself is escalation and Meta forbids it.
- The **Take over** action does not live in the header. It is always in the locked composer, where the agent's attention is.

#### 3.7.5 Locked composer (`message-input.tsx`), state `standby`

A new early-return branch placed **before** the window-closed branches. It reuses their container classes (`m-3 shrink-0 rounded-xl border`) with the amber tone, and has `role="status"`.

```
┌──────────────────────────────────────────────────────────┐
│ 🤖 Meta AI is handling this conversation                 │
│ Your replies are paused so the customer doesn't get      │
│ duplicate answers. Templates can still be sent.          │
│                                                          │
│ [ ✋ Take over ]   [ ⚙ Send flow ]                        │
│ (inline error line, only after a failed take)            │
└──────────────────────────────────────────────────────────┘
```

- **Take over** (primary): calls the thread-control action with `take`.
  - Loading → both buttons disabled + spinner.
  - Success → toast "You're now handling this conversation". The store is patched from the action result, and realtime confirms it. The branch unmounts and the normal composer appears **with the draft preserved** (form state lives in the same component above the early return, so no reset).
  - Error `2494191` → inline destructive text under the buttons: "Only the escalation partner can take over. Routing is configured in Meta Business Suite." It links to the Meta docs and the lock stays.
  - Any other error → toast with the mapped server error, and the lock stays.
- **Send flow** (secondary): reuses the existing `SelectFlowDialog` trigger from `input-menu.tsx`, so agents can still send flows that contain WhatsApp templates. Free-form steps in that flow fail visibly through the gate (D4), which is expected.
- Below `sm` the buttons stack full-width.
- If state `standby` arrives by realtime while the agent is typing, the card replaces the input immediately. The draft is kept and reappears after a take-over.

#### 3.7.6 Timeline

**Divider** (`messageType:"activity"`, `contentAttributes.type:"threadControl"`) uses the existing centred muted variant (`message-item.tsx:108`). The text comes from a `Record<ThreadControlEvent, i18nKey>` and is interpolated with the owner label:

| Event (state change) | Text |
|---|---|
| `standbyReceived` / `controlTaken` | "{owner} is now handling this conversation" |
| `controlPassed` | "{previousOwner} handed this conversation to AhaChat" |
| `inboundReceived` / `serviceSent` (into owned) | "AhaChat is now handling this conversation" |
| `taken` | "AhaChat took over this conversation" |
| `released` | "Conversation released" |
| `passed` | "Conversation passed to the escalation partner" |
| `serviceRejected` | "Message not sent: {owner} is handling this conversation" |

For `controlPassed`, `recordEvent` stores `previousOwnerRole` in `contentAttributes` so the divider can name who handed over.

**Context card** (`contentAttributes.type:"threadControlContext"`) renders through `RenderContentAttributes` as the new `thread-control-context-card.tsx`, a full-width centred card like `WhatsappCallCard`:

```
┌ ✨ Conversation context            [AI summary] ┐
│ The customer asked to change the delivery      │
│ address of order 12345…                        │
│ ─────────────────────────────────────────────  │
│ Handover note: Partner bot cannot edit address │
└────────────────────────────────────────────────┘
```

- **History variant:** badge "History". Rows show `Customer` / `Business` + time + text. The first 5 rows are shown, then "Show all (n)" toggles the rest.
- `suppressRawText` hides the fallback text.
- Empty or invalid context is never written (§3.5.3), so there is no empty card state.

**Partner echo** (`contentAttributes.threadControlEcho`):
- The bubble stays on the outgoing side but uses the muted/secondary bubble style instead of the agent's primary colour.
- A caption `🤖 Partner` sits above the bubble.
- The label is always "Partner": a standby echo does not identify the sending app, so we do not guess Meta AI.
- Template echoes show the rendered text from §3.5.3.

#### 3.7.7 Side panel (`contact-inbox-panel.tsx`)

A new accordion module "Conversation routing", first in `accordionModules`. It renders only when the hook reports a non-null state.

```
Status         ● Handled by Meta AI      (amber)
Since          5 minutes ago             (threadControlUpdatedAt)
AhaChat        Standby — listening only
ⓘ Take over from the message box to reply.
```

The hint line changes per state:
- `owned`: "Release when you're done so other apps can answer."
- `idle`: "The next customer message decides who answers."

#### 3.7.8 Settings (`whatsapps/[id]/settings/page.tsx` → `conversation-routing-card.tsx`)

The card renders only when the kill switch is on. The page reads `isConversationRoutingEnabled()` server-side, so there is no client env leak.

```
Conversation routing
Work alongside other apps (e.g. Meta AI) on this number.
──────────────────────────────────────────────────────────────────
Flow when a conversation is handed to AhaChat   [ Select flow ▾ ][×]
  Tip: end this flow with "Thread control → Release" so the other
  app can answer again when you're done.
ⓘ Who answers first, who can take over (escalation) and who may
  listen (standby) are set by the business in Meta Business Suite.
  AhaChat follows that setup automatically.  Learn more ↗
```

- There is no switch (D12).
- The flow picker reuses `flow-selector.tsx` and saves on select or clear, like the calling card.
  - Pending → the picker is disabled with a spinner.
  - Error → toast and revert to the previous value.
  - Success → toast.
  - Empty → placeholder "No flow — AhaChat only shows the conversation context".
- The action is `update-handover-resume-flow.action.ts`: `bindArgsSchemas` workspaceId + integrationId (called with `.bind(null, …)`), `assertWorkspaceSuperAdmin`, then `integrationWhatsappService.updateHandoverResumeFlow`.
- **Non-super-admin:** the page passes `isSuperAdmin` from the server. The picker is disabled and wrapped in the standard disabled-control `<span>` + `Tooltip` pattern (as used by `CallActionButton`), with "Only workspace admins can change routing". The action stays super-admin enforced.

#### 3.7.9 Data to the client (no extra requests)

- Add `threadControlState`, `threadOwnerRole` and `threadControlUpdatedAt` to `conversationContactInboxResource` (`conversations/schema/resource.ts:46`) and `mapConversationContactInboxes` (`list-conversations.query.ts:32`).
- The side panel reads the same fields from the conversation already in the Zustand store.
- `threadControlService.requestAction` returns the applied snapshot `ThreadControlSnapshot = { contactInboxId, threadControlState, threadOwnerRole, threadControlUpdatedAt }` (§3.4), and the realtime event carries the same shape.
- One new store action, `patchContactInboxThreadControl(conversationId, snapshot)` in `chat-store.ts`, replaces only the matching contact inbox. It **ignores a snapshot older than the stored `threadControlUpdatedAt`**.
- Both the action's `onSuccess` and the `contactInboxThreadControlUpdated` handler in `chat-realtime.tsx` call it. On success the UI unlocks immediately without waiting for realtime, and a late or stale event cannot re-lock it.
- If the socket is down, the next conversation fetch restores the truth.

#### 3.7.10 Flow step editor (`steps/thread-control/`)

- **Editor:** radio group with "Release the conversation" and "Pass to the escalation partner", plus a helper line: "WhatsApp only. On other channels, or if AhaChat doesn't own the conversation, the step follows the Error path."
- **Viewer:** the action label, and success/error states via `BaseStateViewer`.
- **Menu:** in `perform-action/menu.tsx`, next to the conversation actions (assign / bot on-off), with `ArrowRightLeftIcon`.

#### 3.7.11 Out of scope (explicit)

- An inbox filter "Handled by partner".
- Mobile app surfaces.
- Partner read receipts (D14).
- Structured Issue/Order/Reason extraction (D8).

#### 3.7.12 Browser verification checklist (Phase 5)

Use seeded rows or fixtures with each state and check at 375 px and ≥ 1280 px, light and dark:

- **Kill switch off, and on with a single-partner number:** no visual diff anywhere (card hidden when off).
- **idle / owned / standby:** list pill, header, composer and panel in each state.
- **Take over:**
  - loading,
  - success with the draft kept,
  - `2494191` inline error,
  - generic error.
- **Release / Pass:** loading, success, error. The Pass dialog opens and cancels.
- **Realtime:** a second tab switches live.
- **Timeline:**
  - every divider text,
  - summary card, history card with "Show all",
  - partner text echo, template echo.
- **Settings:**
  - flow select / clear / error revert,
  - disabled for non-admin.
- **Flow step:** editor and viewer.
- **Keyboard:** focus order and visible focus on every new button. The lock card is announced (`role="status"`).

### 3.8 Shared-number connect (D13)

`waba-setup.ts` `registerPhoneNumber` already lists the phone numbers. When the listed number reports an already-registered/connected platform status (read the exact field — `status`/`platform_type` — from Meta's phone number reference during implementation), return `{ status: "registered" }` without POSTing `/register`. Coexist keeps its existing short-circuit. This also fixes today's PIN mismatch or overwrite on a number shared through "Share existing WhatsApp phone numbers".

### 3.9 Extensibility

- Everything shared (`thread-control` partial, `ThreadControlService`, SDK handler types, the send gate, realtime, UI) is channel-agnostic and keyed off `ContactInbox.threadControlState`. It only activates when a channel reports `threadControl` in its parse result or implements `updateThreadControl` / `receiveThreadControlEvent`.
- Adding Messenger handover later means implementing the two handlers plus its own subscription. Nothing shared changes.
- New Meta roles are handled by `threadControlRoles` (unknown → `null`). New events require one enum value plus one transition entry.

---

## 4. Concurrency, idempotency, load

| Risk | Handling |
|---|---|
| Webhook redelivery | Deterministic `jobId`s (`wa-tc-<sha>`, `wa-sb-<wamid>`, `wa-sbe-<id>`). Activity/card rows use deterministic `sourceId` + `createOrUpdate`. The resume flow is enqueued only when `recordEvent` reports `eventApplied`, and its `jobId` is deterministic too. |
| Two routing events in the same second | Tie rule in §3.3: total precedence order, plus idempotent redelivery. Tested in both processing orders, including two explicit events and a role-only difference. |
| Out-of-order events (e.g. `control_taken` processed after a later inbound) | Guarded update on `threadControlUpdatedAt <= occurredAt`, using Meta timestamps for webhook events. |
| Two agents press Take over | Meta decides. Both `recordEvent("taken")` calls converge on the same state, and the second is a no-op (`IS DISTINCT FROM` guard). |
| T-7: standby then messages, no duplicate reply | Standby never runs automation. The `messages` delivery runs it once (wamid dedupe via `jobId` + `createOrUpdate`). |
| Losing ownership mid-flow | Gated sends fail fast with a visible error and no retry storm. Flow `error` edges work as usual. |
| Hot paths | Inbound and send check the **in-memory** contact inbox and inbox (`threadControlSeenAt`). Extra writes happen only on a real transition. Partner receipts are dropped (D14). Unknown-contact partner echoes are dropped by the existing third-party guard. |
| Meta API failure on take/release/pass | State unchanged. The UI shows an error. Archive-release retries twice, then logs. |
| Kill switch turned off (and on again) | Off: the webhook drops routing fields and the handler returns `null`; subscriptions are untouched. On again: ops re-run the backfill (§7) so numbers connected meanwhile get the fields. While off, existing non-null states resolve to `idle` within 24 h of user inactivity (M3), and no new ones are written. A stale `standby` can keep a composer locked until then, but Take over still works through the API, which is independent of the flag. This is accepted: the flag is an emergency switch, not a routine one. |
| Same-state event arrives, then an older transition | Every non-stale event advances `threadControlUpdatedAt`, so the older transition is rejected as stale. |

---

## 5. Phases (TDD: failing test first in every step)

Estimates are in man-days. BE and FE can run in parallel after Phase 2.

### Phase 1 — Domain + schema (1.5 d)
- `partials/thread-control.ts` + tests (every transition, 24 h boundary, template exemption, null state).
- Schema columns, migration generated, drift check.
- Repository methods + DB-backed guarded-update tests: stale event, no-op, and workspace scoping, under `packages/database/__tests__/integration` opt-in.

### Phase 2 — SDK + WhatsApp integration (5 d)
- SDK types, `hasChannelHandler`.
- `isConversationRoutingEnabled`, the `subscribeWebhook` field list (flag on/off), and the backfill script (pagination, per-row failure continues, flag-off early exit).
- `extractConversationRoutingPayloads` (tests in `integrations/whatsapp/__tests__/conversation-routing-webhook.test.ts`, following `coexist-webhook.test.ts` helpers): every PDF scenario —
  - standby ×4,
  - handover ×3 (no context / history / summary),
  - messages ×3,
  - pinned-number mismatch,
  - malformed payload.
- `conversation-routing.ts` parsers + template echo rendering.
- `updateThreadControl` / `receiveThreadControlEvent`.
- Error mapper codes.
- Register skip for shared numbers.

### Phase 3 — Business + worker (6 d)
- `ThreadControlService` (unit tests with mocked repository/registry, following existing business test patterns).
- Inbound hooks + automation suppression (extend `apps/worker/__tests__/received-message.test.ts`; T-1, T-5, T-7, including both arrival orders of the same wamid).
- Kill-switch-off regression: no routing jobs are enqueued, the parse output is unchanged, and `subscribeWebhook` sends today's field list.
- Flag on with a single-partner customer: `messages` deliveries on a `null` thread of an inactive inbox (no routing traffic seen) write nothing (query count asserted).
- Active inbox: the first `messages` delivery marks the thread `owned`. `touchThreadControlSeen` is throttled (at most one write per day).
- A context-carrying owner delivery activates the inbox, so the next context-less delivery for **another** contact is recorded `owned`.
- The inbox decays after 30 days without routing traffic, and new threads stay `null`.
- Backfill: a number connected while the flag was off is subscribed on off→on. A rejected full set falls back to base + routing.
- Same-second events (inferred vs explicit, `controlPassed` vs `controlTaken`, same state with a different role) end in the same state in both processing orders.
- Archive of an expired-owned thread enqueues nothing.
- Handover job + resume flow (T-6, dedupe, deleted flow, unknown contact).
- Send gate + reconciler (extend `send-message-handler.test.ts`, `send-whatsapp-template.test.ts`: blocked Service send, template allowed, idle allowed, no retry, `serviceSent` transition).
- Archive-release enqueue (conversation service test).
- Flow step (schema + handler + unsupported channel).
- Queue types.

### Phase 4 — Builder (6.5 d)
- Settings card + action.
- List pill, composer lock, header buttons, side-panel module, divider/context card/echo label.
- Realtime wiring.
- Flow step editor/viewer/menu.
- i18n (all locales).
- Action tests (permission, `.bind`, error mapping).

### Phase 5 — Verification (3 d)
- `pnpm lint`, `pnpm --filter <each touched workspace> check-types`, `pnpm test`.
- Browser verification (`run` skill) of every state in §3.7.12:
  - resume-flow select / clear / error,
  - list pill,
  - composer locked/loading/take-over error/unlocked,
  - release/pass,
  - context card (summary, history),
  - partner echo,
  - flow step editor,
  - at 375 px and desktop widths.
- Meta App Dashboard scenario run T-1 → T-7 once the app is enrolled (owner arranges access).
- Add `docs/whatsapp-conversation-routing.md` (ops setup, behaviour, limits) and link it from the AGENTS.md docs list.

### Phase 6 — Buffer (≈ 4 d, 20 %)

**Total ≈ 21 d build + 4 d buffer ≈ 25 man-days** (the toggle and its disable-race handling were removed; the backfill script and inbox observation were added). With 2 BE + 1 FE in parallel that is about 3–4 calendar weeks.

---

## 6. Risks and open items

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Meta does not publish the error code for a non-owner Service send. | Keep `THREAD_CONTROL_REJECTION_CODES` empty until the first real/test rejection is captured (log `code`/`error_subcode`/`fbtrace_id` of every `PERMISSION_DENIED` send on active inboxes). Until then the local gate still blocks known-standby threads. Only the idle-thread case relies on the code. |
| R2 | App not enrolled / beta access. | Kill switch default off. Fields are neither subscribed nor processed until ops flip it, then the backfill script subscribes existing numbers. Meta documents subscription as inert until a business configures routing (M10). The owner contacts Meta for enrollment and test scenarios. |
| R3 | PDF vs official docs differ (history shape, `previous_owner_app_id`). | Lenient zod parsing of both shapes. Unknown fields are ignored. |
| R4 | `registerPhoneNumber` status field for shared numbers. | Confirm the exact field against the Meta phone-number reference before coding §3.8. Tested with a fixture. |
| R5 | Partner echo volume on busy numbers. | Unknown-contact echoes are dropped early. Receipts are dropped. Known-contact echoes cost the same as today's Messenger echoes. |

---

## 7. Rollout

1. Deploy with `WHATSAPP_CONVERSATION_ROUTING_ENABLED=false` (default). Nothing changes for anyone.
2. The owner arranges Meta enrollment for thread control and the App Dashboard test scenarios.
3. Ops: in the Meta App Dashboard, subscribe the app to `messaging_handovers` and `standby` (one time).
4. Set `WHATSAPP_CONVERSATION_ROUTING_ENABLED=true` on the worker and builder, then run `pnpm --filter worker backfill:whatsapp-webhook-fields` once. New connects and reconnects include the fields automatically from then on.
5. On an internal multi-responder test number, run T-1 → T-7 and capture the non-owner rejection code (R1).
6. Emergency rollback: set the flag to `false`. Behaviour and limits are in the §4 "kill switch" row.
7. Every later off→on flip: re-run the backfill script (idempotent).

---

## 8. Files touched

**New (production files, excluding tests)**
- `packages/database/src/partials/thread-control.ts`
- `packages/business/src/thread-control/service.ts`
- `integrations/whatsapp/src/lib/conversation-routing.ts`
- `apps/worker/src/integration/handlers/thread-control.ts`
- `packages/flow-config/src/steps/thread-control.ts`
- `apps/builder/src/features/integration-whatsapp/components/conversation-routing-card.tsx` + `actions/update-handover-resume-flow.action.ts`
- `apps/worker/scripts/resubscribe-whatsapp-webhook-fields.ts` (+ `backfill:whatsapp-webhook-fields` script entry in `apps/worker/package.json`)
- `apps/builder/src/features/conversations/actions/thread-control.action.ts`
- `apps/builder/src/features/messages/components/thread-control-context-card.tsx`
- `apps/builder/src/features/conversations/hooks/use-thread-control.ts`
- `apps/builder/src/features/flows/react-flow/steps/thread-control/*`
- tests
- `docs/whatsapp-conversation-routing.md`

**Modified**
- DB schema + migration: `contact-inbox.ts`, `inbox.ts`, `integration-whatsapp.ts`
- Repositories: `contact-inbox`, `inbox`, `integration-whatsapp`
- Business: `integration-whatsapp/service.ts`, `conversation/service.ts` (`updateArchived`)
- SDK: `integration.ts`, `shared/message.ts`, `shared/index.ts`
- WhatsApp integration: `api/webhook.ts`, `handlers/webhook.ts`, `handlers/message/incomming-message.ts`, `handlers/conversation.ts`, `lib/error-mapper.ts`, `api/waba-setup.ts`
- Worker: `received-message.ts`, `worker.ts`, `send-message.ts`, `send-whatsapp-template.ts`, `channel-send-error-reconcilers.ts`, `step.ts`, `flow-utils.ts`
- Queue types: `worker-config` integration queue
- Flow config: `step-action.ts`, `index.ts`, `shared.ts`
- Realtime: `partysocket-config/schemas.ts`
- Builder: settings page, `chat-panes.tsx` (hide bot banner on standby), `conversation-action.tsx` (Pass item), `input-menu.tsx` (reuse Send flow trigger), `conversation-item.tsx`, `resource.ts`, `list-conversations.query.ts`, `message-input.tsx`, `message-head.tsx`, `contact-inbox-panel.tsx`, `message-item.tsx`, `chat-realtime.tsx`, `realtime-event-validation.ts`, `steps/index.tsx`, `perform-action/menu.tsx`
- i18n: `messages/*.json`
- Env: `WHATSAPP_CONVERSATION_ROUTING_ENABLED` in the worker/builder env schemas and `.env.example`
