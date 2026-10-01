# Plan: Messenger Conversation Routing (shared with WhatsApp)

Status: **Finalized draft** — reviewed by Codex (`gpt-6-astra`) + Claude Opus, and grounded in the
**v1 sources** (the previous product: `neolab/chatbotai`, `ahachat-fe`, `chatbotai-autoinbox/message-echo/nodejs`).
Note: this project is **white-label** — no fixed product name; "our app" below means this platform.
Backup branch: `backup/feat-whatsapp-conversation-routing-20260930` (local + origin @ `cf957decd`).
Implement on a new branch `feat/messenger-conversation-routing` off `main`.

## 1. Goal & scope

Add Meta **Messenger** Conversation Routing / Handover Protocol, reusing the channel-agnostic
thread-control domain already built for WhatsApp. Net-new code is a **Messenger adapter**; the shared
domain/UI gets a few small, guarded generalizations. **No behavior change for WhatsApp.**

**Topology (confirmed from v1): our app is the PRIMARY receiver on Messenger.** So `take_thread_control`
works; `request_thread_control` is out of scope. v1 scope:

- Ingest `pass_thread_control` (Business-AI → us) and run the resume flow.
- Agent **Take over** → `take_thread_control`.
- **Return to bot** → targeted `pass_thread_control` to the Business-AI app id (config).
- Owner **sync** → `GET /me/thread_owner`.
- Persist the owner **app id**; map Messenger states onto the shared `owned/standby/idle`.

Out of scope for v1: `request_thread_control`, generic role/app picker, a shared settings component,
`extend_thread_control`.

## 2. Meta spec — Messenger vs WhatsApp (adapter must absorb)

| Aspect | WhatsApp | Messenger |
|---|---|---|
| Owner identity | app **role** (`META_AI`…) | app **id** (`new_owner_app_id`) + `app_roles` webhook (`primary_receiver`) |
| Recipient id | phone (`to`) | **PSID** (`recipient.id`/`sender.id`) |
| Thread-control API | one `POST /{phone_number_id}/thread_control` + `action` | separate `POST /me/{take\|pass\|request\|release}_thread_control` (+ `target_app_id` for pass); `GET /me/thread_owner` |
| Handover events | `control_passed` / `control_taken` | `pass_thread_control` / `take_thread_control` / `request_thread_control` / `app_roles` |
| Owner query | none | **`GET /me/thread_owner`** (use it to sync) |
| Standby echoes | `standby.message_echoes[]` (incl. templates) | none (standby carries messages/reads/deliveries/postbacks; postback payload stripped) |
| conversation_context | summary/history | only `metadata` string |
| Webhook timestamp | seconds | **milliseconds** (must floor to seconds — see §6) |
| Templates | yes | yes (`integrations/messenger/.../outgoing-message/index.ts:202`); bypass-ownership is a separate question |
| our app role | escalation (secondary-like; takes from Meta AI) | **primary** (takes; passes back to Business-AI) |

Both channels still map onto the same shared events, so the domain stays shared; only the adapter differs.

## 3. Architecture reuse map (verified)

**Shared, reuse as-is (no channel checks):**
- `packages/database/src/partials/thread-control.ts` — states, `THREAD_CONTROL_TRANSITIONS`, precedence/tie-break, `resolveThreadControlState` (idle), `isServiceSendBlocked` (gate predicate).
- `packages/business/src/thread-control/service.ts` — `recordEvent`, `recordInboundDelivery`, `promoteStandbyDelivery`, `requestAction`, `refreshForRouting`, `releaseOwnedThreadsForContacts`.
- `ContactInbox.threadControl*` columns + `Inbox.threadControlSeenAt` + repo `applyThreadControlTransition`.
- Send gate `assertThreadOpenForServiceMessage` + `recordServiceSent` (`apps/worker/src/chat/handlers/send-message.ts`) — already applies to Messenger sends.
- Worker `receiveThreadControlEvent`/`handleHandover`/`releaseOwnedThread` + `IntegrationJobAction.threadControlEvent`/`.threadControlAction` (generic; take `integrationType`). **Reused, but with two required extensions (not "no change"):** (a) resume-flow must fire only for a BizAI→us Pass — today `worker/.../thread-control.ts:198` resumes *every* applied `controlPassed`; (b) the owner **app id** must propagate through the SDK event/result, the guarded repo transition, the service snapshot, the realtime payload (`service.ts:579` carries roles only) and the UI resource — together — or the new columns can't drive display/resume.
- Builder UI driven by `ThreadControlView`: pill, panel, locked composer, context card, divider, `thread-control.action.ts`, realtime patching.
- **Seam:** `packages/sdk/src/lib/integration.ts` `ConversationHandlers` already has optional `updateThreadControl?` + `receiveThreadControlEvent?`; `packages/channel-registry/src/thread-control.ts` dispatches via `hasChannelHandler`/`runChannelHandler`. Messenger registers only `{sendTyping, agentMarkAsRead}` today (`integrations/messenger/src/handlers/conversation.ts`).

**Messenger-specific to build (mirror `integrations/whatsapp`):** subscription fields, webhook
parsing, conversation handlers (`updateThreadControl`, `receiveThreadControlEvent`), incoming
`threadControl` marker.

## 4. Design decisions (resolved)

- **Owner identity** — add a nullable **`threadOwnerAppId`** column (and a **previous/return-target
  app id**, since a `take` overwrites the current owner). Do NOT invent pseudo-roles — that pollutes
  the `ThreadControlRole` enum (normalized to `null`) and drives `canPass`. Role stays the WhatsApp
  display taxonomy; Messenger display derives from `state + app_id` (owned→"you"; known Meta ids→friendly
  name; else "Partner"). v1 precedent: it stored `thread_owner_state` + `thread_owner_app_id`.
- **Actions v1** — Take (`take_thread_control`, recipient PSID) + Return-to-bot (targeted
  `pass_thread_control` to the Business-AI app id, from config) + `getThreadOwner` sync. No `request`.
- **Per-action capabilities** — the flow step exposes Release/Pass (not Take), and `canPass` stays true
  for an owned Messenger thread with a null role. Introduce per-action capability gating across UI,
  flow schema/validation and runtime so each channel only offers what it supports.
- **`OWNER_ROLE_AFTER_ACTION`** — generalize: the channel `updateThreadControl` handler returns the
  resulting owner (plumb the return through `threadControlService.requestAction`, currently `void`),
  so a Messenger take doesn't stamp WhatsApp's `escalation` role.
- **Ownership direction + new event kinds** — compare the event's owner app id vs our app id before
  choosing a transition. `request_thread_control` (a request) and `app_roles` (Page config) do NOT fit
  the `controlPassed`/`controlTaken` union (`sdk/.../shared/message.ts`) — add separate kinds
  (for v1: parse+log `app_roles`, ignore `request`).
- **Comments** — exempt **public comments only** from the gate (`type==="comment" && !isDirectMessage`,
  `send-message.ts:65`); a private-reply DM must still respect the gate. (`recordServiceSent` already
  guards `if (!isComment)`.)
- **Resume flow** — reuse the shared resume-flow path; store the flow id on `IntegrationMessenger`
  (mirror `handoverResumeFlowId`) or a channel-agnostic place. Duck-typed read makes it inert if unset.
- **Config** — the Business-AI app id to pass back to (per-integration or global; mirrors v1
  `services.facebook.business_ai_app_id`).
- **Settings UI** — keep per-channel for v1 (the WhatsApp card binds a WhatsApp integration id).

### 4.1 Behavioral contracts (pinned — from the final Codex pass)

- **Resume eligibility.** Fire the resume flow **only for a Business-AI → us Pass** — never our own
  Take, never `getThreadOwner` sync, never another partner's transfer. Gate by owner **app id**
  (from == Business-AI id, new owner == us). Today `worker/.../thread-control.ts:198` resumes *every*
  applied `controlPassed` — Messenger must add this app-id gate. v1 additionally filtered on the nested
  `pass_thread_control.thread_control_metadata.text` (an AI-transfer sentence,
  `MessageHandover.php:40`) — the parser must read that nested field (not the flat `metadata`), and we
  state that the **app-id check is the primary gate**, with the text filter optional/secondary.
- **Idle / expiry model.** Do **not** silently inherit WhatsApp's blind 24h idle (`resolveThreadControlState`,
  `partials/thread-control.ts:128`) for Messenger — that would auto-unlock standby. v1 stores an expiry
  and consults Meta's returned expiration (`BusinessAiOwnershipService`), and reconciles via
  `getThreadOwner`. Define a **per-channel expiry/reconciliation** for Messenger (Meta expiry +
  `getThreadOwner` sync) rather than the WhatsApp 24h rule.
- **Sync is a separate operation.** `getThreadOwner` is not take/release/pass; the SDK
  `updateThreadControl` contract (`integration.ts:274`) accepts only those. Add a **separate sync
  capability/handler** (or an explicit contract extension), not a fake action.
- **Archive behavior.** Decide per channel: Messenger archive should **skip release** or do a targeted
  Pass to Business-AI — it must **not** record `idle` after handing ownership back. Add capability
  gating + an execution-time ownership check.
- **Business-AI config.** Choose the location (per-integration on `IntegrationMessenger`, or global,
  mirroring v1 `config/services.php`), and the **missing-config behavior** (no return-to-bot if unset).
  Keep three ids distinct: the **owner** app id, the **return target** (Business-AI) app id, and **our
  own** app id.
- **Inbound classification (we are primary).** A non-echo `entry.messaging[]` item = **owner delivery**
  (we hold control); an `entry.standby[]` item = **non-owner delivery** (Business-AI holds control) →
  suppress automation despite our primary role. Keep our DMs/templates **gated while Business-AI owns**.
- **`request_thread_control`** — we only **parse+log/ignore** inbound `request` events; we do **not**
  issue `request_thread_control` (that's a secondary-receiver action, out of scope).

## 5. Implementation phases

**Phase 1 — schema + guarded generalizations (regression-tested; not a pure WhatsApp no-op):**
1. Migration: add nullable `threadOwnerAppId` (+ previous/return-target app id) to `ContactInbox`.
2. UI `apps/builder/src/features/conversations/utils/thread-control.ts` — resolve the routing contact
   inbox by a **set of routing channels** (or by composer channel); `isLocked` for any routing channel;
   handle a conversation with two routing inboxes. Add a selection regression test.
3. `channel-registry/thread-control.ts` — owner-role-after-action returned by the channel handler.
4. `send-message.ts` — exempt public comments from the gate (order the comment check before the gate).
5. Per-channel wording for the `passed` divider text / docs link / template tab (channel-condition,
   so WhatsApp copy/exports don't change).

**Phase 2 — Messenger adapter:**
6. Subscribe: add `messaging_handovers` to `PAGE_SUBSCRIBE_SCOPES` (`apis/page.ts`, preserving existing
   fields like `leadgen`); write a re-subscribe backfill for existing Pages.
7. Webhook: extend `handlers/webhook.ts` + `schema.ts` to parse `entry.standby[]` and
   `messaging[].{pass,take,request}_thread_control` + `app_roles`, **resiliently** (one bad item must
   not skip the whole batch; standby postbacks omit payload; `app_roles` has no contact `sender`).
   Enqueue `threadControlEvent` with the WhatsApp job options + deterministic jobId.
8. Parser `integrations/messenger/src/lib/conversation-routing.ts` (new) — map events →
   `ThreadControlWebhookEvent` (`pass_thread_control`→`controlPassed`, `take_thread_control`→`controlTaken`),
   app_id→owner (+ role display), **floor ms → whole seconds** (`toThreadControlTimestamp`) for handover
   AND inbound/standby; `metadata`→handoverNote. Don't treat ordinary `messaging[]` echoes as owner deliveries.
9. Conversation handlers `handlers/conversation.ts` — `updateThreadControl` (take / targeted-pass-to-BizAI /
   getThreadOwner) with `recipient={id:PSID}`; `receiveThreadControlEvent`; register both in `integration.ts`.
   Map a Messenger take/permission refusal → `ThreadControlTakeRefusedError` with channel-aware copy.
10. Incoming `handlers/message/incoming-message.ts` — set `threadControl:{delivery, occurredAt}` (owner
    vs standby); keep the same `mid` as `sourceId` across owner/standby but distinct queue identities so
    dedup can't drop the owner delivery.
11. Messenger rejection reconciler — add to `channel-send-error-reconcilers.ts` so a missed handover
    doesn't leave repeated failed sends + stale UI.
12. Resume-flow config on `IntegrationMessenger` + settings surface (or reuse), + the Business-AI app id config.

## 6. Correctness must-fixes (from review)

- **[P0] Floor Messenger ms timestamps to whole seconds** everywhere (handover + inbound + standby),
  reusing `toThreadControlTimestamp`; else the same-second precedence tie-break is silently bypassed
  (e.g. Taken@+100ms then Passed@+900ms → wrongly ends standby). **Mandatory:** promotion's `+1000ms`
  bump (`thread-control-inbound.ts:39`) must not overwrite a genuinely-later handover, including one
  within the original ms timestamp's second — add that exact regression case.
- **[P0] Normalize ownership direction**, not event names; add separate kinds for `request`/`app_roles`.
- **[P1] Webhook batch resilience + schema variants** (standby, stripped postback, reads/deliveries,
  Page config). One bad item must not drop the batch (`webhook.ts:60`).
- **[P1] Dedup identity** — shared `mid`, distinct owner/standby queue identity; test both arrival
  orders, concurrency, retries, intervening handover.
- **[P1] Archive auto-release** — capability-gate + execution-time ownership/version check so a delayed
  release can't undo a newly reacquired thread.
- **[P1] `ThreadControlTakeRefusedError` copy** — channel-aware (today collapses to `notEscalation`).

## 7. Testing

- Messenger parser unit tests (mirror `conversation-routing-parsers.test.ts`) incl. ms→second flooring.
- Send-gate: add a Messenger standby case to `thread-control-send-gate.test.ts`; flow-send freshness.
- Two-routing-inbox UI selection test; `passed` copy regression.
- Dedup/promotion tests (both orders, concurrent, retry, intervening handover).
- Meta App Dashboard webhook scenarios against a test Page.
- Full `pnpm lint` + typecheck + the ~1118 existing routing tests stay green.

## 8. Deployment & rollback

Order: nullable schema → deploy compatible readers/workers/handlers everywhere → enable ingestion +
actions → re-subscribe existing Pages (preserving other fields) → verify subscriptions/config +
reconcile unknown ownership via `getThreadOwner`. Existing Pages already subscribe to `standby`, so
the ingestion deploy itself activates traffic. A code revert alone does NOT undo subscriptions or
persisted Messenger standby state → provide an explicit **disable** procedure (stop ingesting +
un-gate), not just a revert.

**Latent bug to fix regardless:** Messenger Pages already subscribe to `standby` but the webhook drops
`entry.standby[]` today — while Business-AI owns a thread, the user's messages arrive on standby and
are silently lost. Ingesting standby closes this.

## 9. v1 reference (source of the topology decision)

`chatbotai` (Laravel): `Services/Webhook/Facebook/Events/MessageHandover.php` (ingest `pass_thread_control`
from BizAI, gated on the AI-transfer metadata text, then takeover + resume), `MessageStandby.php`,
`MetaBusinessAi/HumanTakeoverService.php`, `Libs/FacebookHelper.php` (`take_thread_control` /
`pass_thread_control`+`target_app_id` / `GET /me/thread_owner`), `Models/LiveChatConversation.php`
(`thread_owner_state` HUMAN/BUSINESS_AI/UNKNOWN + `thread_owner_app_id`), `ConversationOwnerEvent`.
`ahachat-fe` (UI), `chatbotai-autoinbox/message-echo/nodejs` (a separate echo-ingest worker in v1 —
folded into ChatbotX04's inline echo parsing, no separate service).
