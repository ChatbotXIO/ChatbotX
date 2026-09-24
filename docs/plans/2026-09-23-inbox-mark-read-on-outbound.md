# Implementation Plan: Per-inbox "mark conversation read when a reply is sent" + inbox list unread/ordering fixes

Status: Codex review #3 = APPROVE WITH CHANGES (private-comment-reply scope) — changes applied; ready for user go.

## 1. Requirements

1. **New per-integration option, default OFF** (`Inbox.markReadOnOutbound`): when the bot
   sends a **DM** to the contact and the channel confirms the send, the conversation stops
   showing as **unread in the ChatbotX inbox** (agent-side read state). Today a bot/flow
   reply leaves it unread; only a human reply typed in ChatbotX clears it (unchanged).
2. **Channel echoes** (D1 = include): Messenger, Instagram, Zalo OA and TikTok deliver a
   webhook when the Page/OA/account itself sends a message. With the option ON, an echo that
   lands as a *new* outgoing DM row (a reply sent outside ChatbotX — Meta Business Suite,
   Zalo OA admin, TikTok app) also clears unread. Telegram, WhatsApp Cloud API and Webchat
   have no echo of API-sent messages; the API success response is the only signal.
3. **Excluded from the option** (D2): broadcast sends, template sends
   (`send-whatsapp-template.ts`, `send-messenger-template.ts`), **public** comment replies,
   inline AI private comment replies (no `Message` row), WhatsApp coexistence echoes
   (`smb_message_echoes` → bulk import), sending `mark_seen` to the platform
   (`agentMarkAsRead` TODO). **Private** comment replies with a `Message` row are DMs on the
   contact's DM conversation and are included.
4. **Bug — list rows never highlight unread**: fix `isUnread` to the server's definition
   (D3 also fixes the "Unread" tab, which drops never-read conversations).
5. **List ordering (new)**: clicking a row keeps its position; only a deep link / F5 with
   `conversationId` in the URL moves the opened conversation to the top (existing
   behaviour). While the active conversation sits at the top, new messages for *other*
   conversations slot in **below** it. Every message kind (incoming, bot, echo) keeps
   bubbling its conversation up, as today. A customer message arriving on the open
   conversation is NOT auto-read locally (the server is the source of truth). It becomes
   read on any deliberate interaction with the open thread — click, keyboard focus, scroll,
   wheel — and when the agent leaves it (switches conversation, goes back to the list);
   pointer movement alone never counts (`useThreadReadTracking`). Clicking the open row
   again and replying still mark it read. All paths go through `useMarkConversationRead`
   (one in-flight request per conversation).
6. **Product decisions accepted** (raised by Codex): read state is conversation-wide, so a
   reply on inbox A clears unread caused by inbox B of the same contact (one thread in the
   UI); a native echo is stamped at processing time, so an echo delayed past a later
   customer message can clear unread for that message — narrow window, documented, provider
   timestamps are a follow-up because `IncomingMessage` carries none.

## 2. Current behaviour (verified 2026-09-23)

### 2.1 Unread model — derived, not stored

`Conversation` (`packages/database/src/schema/conversation.ts:31-34`): `contactLastReadAt`
(contact read *our* messages), `agentLastReadAt`, `lastActivityAt`.

Canonical predicate (`packages/database/src/queries/contact-filter/index.ts:666-669`):
`lastActivityAt IS NOT NULL AND (agentLastReadAt IS NULL OR lastActivityAt > agentLastReadAt)`.

Writers of `agentLastReadAt` (`packages/business/src/conversation/service.ts`):

| Method | Line | Called from | Effect |
|---|---|---|---|
| `markAgentReplied` | :125-140 | `message/create-outgoing.ts:198-237` (inbox composer + public API) | `agentLastReadAt = lastActivityAt = adminRepliedAt = at` |
| `updateReadStatus` | :1253-1278 | `readConversationAction`, `/conversations/{id}/read` (private+public) | exact value, `invalidate`, broadcasts `conversationUpdated {agentLastReadAt}` |
| `markUnread` | :1215-1251 | unread action/API | rewinds to 2nd-last incoming (may be `null`) |
| `markReadByContact` | :1284-1319 | `contactMarkAsRead`, `messageStatus read` | **contact** side only |

Bot/flow sends only bump `lastActivityAt` (`recordOutboundFlowStep`,
`recordOutboundMessageActivity` → `updateFlowStepState` :1395) with `at = message.createdAt`
(`apps/worker/src/chat/handlers/send-flow-step.ts:855,1165`). Incoming/echo rows:
`saveAndBroadcastMessage` → `persistNewMessageSideEffects` → `recordInboundActivity`
(`received-message.ts:864-901`), `at = message.createdAt`, where `createdAt` is
`createdAt ?? new Date()` at processing time (:751).

### 2.2 Successful-send paths and who owns the persisted message

`apps/worker/src/chat/handlers/send-message.ts` exposes two shared adapters:

- `sendMessageToChannel(data, attemptsMade, willRetryOnThrow)` (:49) — `data.message` is
  the **already persisted** `Message` row (`new Date(message.createdAt)` is used at :199 for
  `updateMessageSourceId`); `data.metadata` is available. Success branch :192-256
  (`updateMessageSourceId`, `recordOutboundMessageSent` :215, `unblockIfBlocked` in
  try/catch, `emitBotMessageSentEvents`). It resolves **without** delivery in two cases:
  a reconciled/suppressed failure returns `{ messageIds: [], sentCount: 0 }` from the catch
  (:310-313, never reaching the success branch), and a channel handler may report
  `sentCount: 0` inside the success branch (test `send-message-handler.test.ts:277`).
  Callers: `chat/worker.ts:81` (`sendChannelMessage` job — producers: `received-message.ts`,
  `questionnaires/services/engine.ts`, `get-user-data.ts`, `appointment-scheduling.ts`,
  `story-reply-automation/index.ts`, `packages/business/src/minigame/minigame-contact-service.ts:997`;
  all DM system/bot messages, plus comment replies where `message.type === "comment"`),
  `send-flow-step.ts:1054 sendChatMessage` (:1176, inside `Promise.all`),
  `send-flow-step.ts:869` (public comment-anchored replies). **Never** called by the
  template handlers.
- `sendFlowStepToChannel` (:636-734) — `messageCreatedAt` optional (:660); returns the
  channel's `OutgoingSendResult`. Callers: `send-flow-step.ts:885` (inside `Promise.all`)
  **and both template handlers** (`send-messenger-template.ts:265`,
  `send-whatsapp-template.ts:317`).

⇒ `sendMessageToChannel`'s success branch is a safe, template-free boundary that owns the
persisted row; `sendFlowStepToChannel` is not (templates), so its hook goes in the
`sendFlowStep` caller. Broadcast flow-steps are identifiable: `send-flow-step.ts:173` already
reads `extractMetadata("broadcastId", metadata)`; `sendChatMessage`/`sendChannelMessage`
carry the same `metadata` bag.

Message rows are created *before* the channel call (`received-message.ts:687-689`), so
`message.createdAt` precedes any contact message that arrives while the send is in flight.

### 2.3 Echo → outgoing row per channel (verified against official docs + code)

| Channel | Echo signal | Handling today |
|---|---|---|
| Messenger | `message_echoes`, `message.is_echo` | `integrations/messenger/src/handlers/webhook.ts:262-294`: own sends (`metadata === MESSENGER_MESSAGE_METADATA`) dropped; others → `incomingMessage`; direction = sender === pageId → `outgoing` |
| Instagram (both) | `is_echo` inside `messages` (no separate field per Meta docs) | `integrations/instagram(-facebook)/src/handlers/webhook.ts:198-218`, same pattern |
| Zalo OA | `oa_send_*` (`integrations/zalo/src/schema/webhook.ts:128-137`) | `webhook.ts:108-121` → `incomingMessage`; own sends dedupe by `msg_id` sourceId |
| TikTok | `im_send_msg` | `integrations/tiktok/src/handlers/webhook.ts:303-325`, 2 s delay, `isEcho` → `outgoing` |
| WhatsApp | none for API sends (`statuses` → `messageStatus`); `smb_message_echoes` → `coexistWhatsappBuffer` | out of scope |
| Telegram | none (Bot API `Update` has no echo/read type) | success path only |
| Webchat | internal | success path only |
| Threads / API / SMTP | no DM inbox / no toggle | column stays false |

**Per-channel gate verification (2026-09-23)** — the hook fires only when the channel
handler reports `sentCount > 0`, so every `sendMessage`/`sendFlowStep` return was checked:

| Channel | `sentCount` on a real send | Own-send echo dedupe (`sourceId`) | Notes |
|---|---|---|---|
| Messenger | `+= 1` per Graph call (`outgoing-message/index.ts:164,275`) | echo dropped at webhook by `MESSENGER_MESSAGE_METADATA` | — |
| Instagram / Instagram-Facebook | `+= 1` (`:126,353` / `:60,293`) | dropped by `INSTAGRAM_MESSAGE_METADATA` | — |
| WhatsApp | `+= 1` after a 2xx (`:351,434`); `messages[0].id` → `messageIds` | n/a (no API echo) | `statuses` webhooks untouched |
| Zalo | `+= 1` (`:45,179`); `response.data.message_id` = webhook `msg_id` (`schema/webhook.ts:177-178`) | dedupe via `createOrUpdate` | — |
| Telegram | `sentCount = messageIds.length` (`:141,298`); every send pushes an id or throws | n/a (no echo) | — |
| TikTok | `+= 1` per send (`:54,75,118,136,154`); `data.message.message_id ?? data.message_id` (`apis/message.ts:84`) | dedupe when id present; if TikTok omits it the echo is inserted as a new row (`apis/message.ts:88`) and the echo hook marks read — same outcome | `im_send_msg` delayed 2 s at webhook; official Business Messaging docs are JS-rendered and not fetchable, semantics taken from `schema.ts:75-77` + `__tests__/webhook.test.ts` fixtures |
| Webchat | constant `sentCount: 1` (`handlers/message.ts:29,37`) | n/a | — |
| API channel | `sentCount: 1` on delivery, `0` when no target (`outgoing-message.ts:28,53,71,95`) | n/a | no toggle in UI; column stays false |

All echoes converge on `saveAndBroadcastMessage` (`received-message.ts:717-862`):
`isInboundMessage = messageType !== "outgoing"` (:747); echo rows are `senderType: "user"`,
`senderId: null`; `repository.createOrUpdate*` returns `isNew` (sourceId dedupe ⇒ duplicate
webhooks and our own send's echo are `isNew: false`). `inbox` is already loaded there.
Comment echoes share the function via `receiveComment` (`incomingMessage.type === "comment"`).

### 2.4 Client

- `apps/builder/src/features/conversations/conversation-item.tsx:203-207` — buggy `isUnread`
  (`agentLastReadAt` vs `contactLastReadAt`, both required non-null).
- `:233-255` — `readConversationAction` fires when the row becomes active; store
  `readConversation` sets `agentLastReadAt` locally.
- `apps/builder/src/features/chat/store/chat-store.ts`: `handleNewMessage` :991-1043 (leaves
  bot sends/echoes unread by design, tests `chat-store.test.ts:661-864`);
  `updateConversationViaMessage` :872-900 splices the conversation to index 0 on **every**
  message; `prependConversation` :427-433 (dedupes by id, inserts at 0);
  `bubbleConversationToTop` :904-946; `loadAndSelectConversation` :290-320 prepends on URL
  open. Row click (`conversation-list.tsx:211-214`) only sets the URL param +
  `setActiveConversationId` — no reorder. List is `react-virtuoso` (`conversation-list.tsx:200`).
- `apps/builder/src/features/chat/chat-realtime.tsx:138-198` — no `conversationUpdated`
  handler (`chat-realtime.test.tsx:99` asserts exactly nine). Broadcasts are enqueued
  asynchronously (`service.ts:1568-1600` → chatQueue → realtime), so **events can arrive out
  of order** relative to local actions.
- `packages/partysocket-config/src/schemas.ts:126-140` — `changes.agentLastReadAt?: string | null`.
- Unread tab (`build-conversation-where.ts:147-156`) uses `lastActivityAt > "agentLastReadAt"`
  only — `NULL` comparison drops never-read conversations. `where.OR` is taken by the cursor (:78).

### 2.5 Per-integration settings UI

No generic settings blob; typed columns per `Integration<Channel>`. Surfaces:

| Channel | Surface | Precedent |
|---|---|---|
| Messenger | `features/integration-messenger/update-messenger-form.tsx` (edit page) | `components/tag-sync-card.tsx` (Card + Switch + `useAction`), rendered :361-366 |
| Instagram | `features/integration-instagram/components/update-instagram-form.tsx` | — |
| Webchat | `features/integration-webchat/components/update-webchat-form.tsx` | — |
| WhatsApp | `features/integration-whatsapp/whatsapp-manage.tsx` (table) | — |
| Zalo | `features/integration-zalo/zalo-manage.tsx` (table) | — |
| Telegram | `features/integration-telegram/telegram-manage.tsx` (table) | — |
| TikTok | `features/integration-tiktok/tiktok-manage.tsx` (table) | `components/tiktok-comment-to-message.tsx` (Switch in a `TableCell`) |

`inboxId` exposure: Messenger/Instagram/WhatsApp/Zalo/Telegram/Webchat resources
(`packages/business/src/integration-*/schema.ts`) include it; **TikTok's does not**
(`apps/builder/src/features/integration-tiktok/schema/resource.ts` + `queries/index.ts:18`
`toResource`) — must be added. Inbox list on the client: `useInboxes` / `useInvalidateInboxes`
(`features/inboxes/provider/inbox-hook.ts`); `inboxResource = createSelectSchema(inboxModel)`
so a new column flows through automatically.

## 3. Design

### 3.1 Storage — one boolean on `Inbox`

`packages/database/src/schema/inbox.ts`: `markReadOnOutbound: boolean().notNull().default(false)`.
Channel-agnostic (one `Inbox` per integration; both hook points hold `inboxId`), one
migration. Boolean `.default(false)` is a real DB default (`IntegrationMessenger.coexistEnabled`).

Migration: `pnpm --filter @chatbotx.io/database make:migration add_inbox_mark_read_on_outbound`
→ folder under **`packages/database/drizzle/`** (`drizzle.config.ts:5 out: "./drizzle"`),
SQL `ALTER TABLE "Inbox" ADD COLUMN "markReadOnOutbound" boolean NOT NULL DEFAULT false;`.
Generate + inspect only; **never apply without explicit approval**. `pnpm lint` runs `db:check-drift`.
Fix `InboxModel` test fixtures the type-check flags.

### 3.2 Business — `ConversationService.markReadByOutbound`

Sibling of `markReadByContact`:

```ts
async markReadByOutbound(props: { workspaceId: string; conversationId: string; inboxId: string; readAt: Date }): Promise<boolean>
```

One statement (`db.update(conversationModel).set({ agentLastReadAt: readAt })…returning({ id })`):

```sql
WHERE id = $conversationId AND "workspaceId" = $workspaceId
  AND ("agentLastReadAt" IS NULL OR "agentLastReadAt" < $readAt)
  AND EXISTS (SELECT 1 FROM "Inbox" WHERE id = $inboxId AND "workspaceId" = $workspaceId AND "markReadOnOutbound" = true)
```

Row updated ⇒ `this.invalidate({ workspaceId, ids })` + `broadcastConversationEvent(conversationUpdated, { conversationIds, changes: { agentLastReadAt: readAt.toISOString() } })`
(same shape as `updateReadStatus`). Returns `updated.length > 0`.

Properties: only ever advances (retries/duplicate echoes idempotent, never regresses a newer
agent read); `readAt = message.createdAt` equals the `lastActivityAt` bump of that send, so
the reply itself reads as "read" while a later inbound keeps `lastActivityAt` ahead; option
OFF = one zero-row PK-scoped UPDATE (PK subquery), no cache/broadcast work. Known
inconsistency window: DB row updated but `invalidate`/enqueue fails → stale cache until the
next write/TTL (same profile as `updateReadStatus`; logged by the caller, not retried).

Rejected: `updateReadStatus` (unconditional, would regress), `markAgentReplied` (stamps
`adminRepliedAt` → "no admin reply" filter; a bot reply is not an admin reply, see
`chat-store.ts:1007-1015`), a `message:sent` listener (`sendMessageToChannel` never emits it).

### 3.3 Business — `InboxService.updateMarkReadOnOutbound`

`async updateMarkReadOnOutbound(props: { workspaceId: string; id: string; enabled: boolean }): Promise<InboxModel>`
— workspace-scoped `UPDATE … RETURNING`, throws not-found on zero rows. The flag is read inside
the conversation UPDATE, never cached, so no invalidation is needed.

### 3.4 Worker hook — confirmed DM deliveries only

One eligibility rule + one never-throw wrapper, both in
`apps/worker/src/chat/handlers/send-message.ts` (the wrapper exported for `send-flow-step.ts`):

```ts
const isDeliveredDirectMessage = (props: {
  message: Pick<MessageModel, "type" | "contentAttributes">; metadata: Record<string, unknown> | undefined; result: OutgoingSendResult
}): boolean =>
  props.result.sentCount > 0 &&                              // channel confirmed at least one send
  isDirectMessage(props.message) &&                          // DM or private comment reply; public comment replies excluded
  extractMetadata("broadcastId", props.metadata) === undefined // broadcasts excluded (D2)

// A private comment reply is a DM: send-message.ts:122-123 routes it to `sendPrivateReply`
// and create-outgoing.ts:127 already files it on the contact's DM conversation — the same
// `isPrivateReply` flag both of them read, so the three stay in lockstep.
const isDirectMessage = (message: Pick<MessageModel, "type" | "contentAttributes">): boolean =>
  message.type !== "comment" || message.contentAttributes?.isPrivateReply === true

export const markConversationReadAfterDelivery = async (props: {
  workspaceId: string; conversationId: string; inboxId: string; readAt: Date
}): Promise<void> => {
  try { await conversationService.markReadByOutbound(props) }
  catch (err) { logger.warn({ err, ...props }, "markReadByOutbound after a delivered send failed") }
}
```

Call sites:

1. **`sendMessageToChannel` success branch** (after `recordOutboundMessageSent` :215), when
   `isDeliveredDirectMessage({ message, metadata, result })`:
   `{ workspaceId: conversation.workspaceId, conversationId: conversation.id, inboxId: contactInbox.inboxId, readAt: new Date(message.createdAt) }`.
   Covers every `sendChannelMessage` producer (bot/system DMs: questionnaire, get-user-data,
   appointment, story-reply, minigame — all "a DM delivered to the contact", so included by
   policy) and `sendChatMessage` (agent/API/AI). Human/API sends are already read via
   `markAgentReplied` → the UPDATE is a no-op. The reconciled-failure `return { sentCount: 0 }`
   in the catch never reaches this branch; a `sentCount: 0` success result is gated out.
2. **`sendFlowStep` (`send-flow-step.ts`)**, the non-public branch: capture the
   `sendFlowStepToChannel` promise as `channelSend`, keep it in the `Promise.all`, then
   `const sendResult = await channelSend` (already settled) and, when `message` exists and
   `isDeliveredDirectMessage({ message, metadata, result: sendResult })`, call the wrapper
   with `readAt = message.createdAt`. The public-comment branch already routes through
   `sendMessageToChannel` (call site 1, excluded there by `isDirectMessage`). Templates
   never enter `sendFlowStep` → excluded by construction.
   **Inline AI private comment replies** (`comment-automation/ai-reply.ts:303`
   `sendPrivateReplyText`) persist no `Message` row and bump no conversation activity, so
   there is nothing to clear — excluded by construction (the module never reaches a hook site), documented here; no dedicated test because a mock-not-called assertion on a module that does not import the service would pass vacuously.
3. **`received-message.ts` `saveAndBroadcastMessage`** — inside `if (isNew)`, when
   `!isInboundMessage && (incomingMessage.type ?? "message") === "message"`:
   `markReadByOutbound({ workspaceId: inbox.workspaceId, conversationId: conversation.id, inboxId: inbox.id, readAt: newMessage.createdAt })`
   in its own try/catch + `logger.warn`. `isNew` excludes duplicate webhooks and (via sourceId)
   own-send echoes on Zalo/TikTok. When an own-send echo still lands as a NEW row (provider returned
   no message id, or the echo beat `updateMessageSourceId`), the existing `isEchoOfOwnSend` lookup
   in `pendingOnly` mode (candidate must still have `sourceId === null` and non-null equal text, so
   media rows and human replies with identical text are not misclassified) identifies it and the
   handler treats it like a dedupe hit for activity purposes: no
   `persistNewMessageSideEffects` (so `lastActivityAt` is not bumped past the send path's read
   stamp) and no read hook — the send path already recorded activity and read state with its
   broadcast/template/comment gating. This is order-independent (echo before or after the send
   confirmation) and keeps broadcast/template echoes unread (D2). The row itself and its
   `message:received` emit are unchanged (pre-existing duplicate-row behaviour), while its
   realtime `messageCreated` broadcast is skipped.

If the channel delivered but our API call failed or timed out, the conversation stays unread on
the safe side; retry behaviour is unchanged. A human native reply with identical non-null text to
a still-pending ChatbotX send within the 2-minute window is treated as the own echo (no activity
bump / no read mark); this is accepted as a narrow residual behaviour.

**Precedence vs. manual "mark unread"** (decided): a delivery confirmed after the agent
clicked *mark unread* re-reads the conversation up to that reply's `createdAt` — the bot
did answer, so the reply is the newer signal. The window is the send latency. `markUnread`
issued *after* the delivery keeps winning (it writes an older/null value the hook has
already passed). Tested both ways.

### 3.5 Realtime — monotonic client apply

Store method (`chat-store.ts`), unit-tested:

```ts
applyAgentLastReadAt: (conversationIds: string[], agentLastReadAt: Date) => void
// for each id: patch only when local.agentLastReadAt === null || agentLastReadAt > local.agentLastReadAt
```

`chat-realtime.tsx` handler:

```ts
conversationUpdated: (event) => {
  const { conversationIds, changes } = event.data
  if (!changes.agentLastReadAt) return   // undefined: not a read change; null (markUnread): not applied live — today it isn't either
  applyAgentLastReadAt(conversationIds, new Date(changes.agentLastReadAt))
},
```

Ordering: a delayed outbound-read event can never overwrite a newer local manual read;
duplicate deliveries are no-ops; an unparsable timestamp is ignored (`Number.isNaN(date.getTime())`).
Bot reply with option ON: `messageCreated` → row bold → send succeeds →
`conversationUpdated` → normal. Side effect: agent "mark as read" now syncs across tabs.
**Explicit limitation**: cross-tab *mark unread* (`changes.agentLastReadAt: null` or an
older value) stays unsynchronised, exactly as today — this handler is a read-advance
channel, not general conversation sync.

### 3.6 Builder — unread predicate (bug fix + D3)

`apps/builder/src/features/conversations/lib/is-conversation-unread.ts`:

```ts
export const isConversationUnread = (c: Pick<ConversationResource, "lastActivityAt" | "agentLastReadAt">): boolean =>
  c.lastActivityAt !== null && (c.agentLastReadAt === null || isAfter(c.lastActivityAt, c.agentLastReadAt))
```

`conversation-item.tsx:203-207` → `isConversationUnread(conversation)`. Store already keeps
both inputs live. D3: `build-conversation-where.ts:150-156` → `where.AND = [{ OR: [{ agentLastReadAt: { isNull: true }, lastActivityAt: { isNotNull: true } }, { lastActivityAt: { gt: sql\`"agentLastReadAt"\` } }] }]`
(nest under `AND` because `OR` is the cursor's; fall back to drizzle's RAW where if
`QueryWhere` rejects the nested shape).

### 3.7 Builder — pinned active conversation (requirement 5)

One placement rule in the store, used by every list writer:

```ts
// chat-store.ts (module-local)
const placeConversation = (list, conversation, activeConversationId) => {
  const rest = list.filter((c) => c.id !== conversation.id)
  const pinnedActive = activeConversationId !== null && conversation.id !== activeConversationId && rest[0]?.id === activeConversationId
  return pinnedActive ? [rest[0], conversation, ...rest.slice(1)] : [conversation, ...rest]
}
```

- `prependConversation`, `updateConversationViaMessage`, `bubbleConversationToTop` all go
  through `placeConversation` (replaces the three hand-rolled splice/prepend blocks), reading
  `state.activeConversationId` inside the same `set((state) => …)`.
- **Select before place**: `loadAndSelectConversation` (:300-301, :311-312) currently
  prepends *then* sets active — under the new rule that would pin the *old* active row and
  put the newly opened one at index 1. Flip the order in both branches:
  `setActiveConversationId(conversationId)` then `prependConversation(...)` (zustand `set`
  is synchronous, so the second `set` sees the new active id). Row select
  (`conversation-list.tsx:211-214`) does the same: `setActiveConversationId(item.id)` →
  `prependConversation(item)` → `virtuosoRef.scrollToIndex({ index: 0, behavior: "smooth" })`.
  `openConversation`'s "already active → no-op" (`chat-store.test.ts:289`) is unchanged.
- `setActiveConversationId(null)` / switching conversation: the previous one keeps its
  position (no re-sort); server order is restored on the next list fetch. Cursor pagination is
  unaffected (`loadMoreConversations` appends by server cursor; already tolerant of
  prepended rows — `chat-store.test.ts:492`).
- Existing tests to update: `chat-store.test.ts:113,140,200,525,546,590,615` (prepend/top
  semantics); new: message for another conversation while one is active → index 1; message
  for the active conversation → stays index 0; no active → index 0; select moves row to top;
  `loadAndSelectConversation`/`openConversation` while another conversation is active → the
  newly opened one is index 0.

### 3.8 Builder — toggle (one shared component, seven surfaces)

`apps/builder/src/features/inboxes/`:

- `actions/update-mark-read-on-outbound.action.ts` —
  `workspaceActionClient.bindArgsSchemas([zodBigintAsString(), zodBigintAsString()]).inputSchema(z.object({ enabled: z.boolean() })).action(…)`
  → `inboxService.updateMarkReadOnOutbound` (mirrors `toggleMessengerTagSyncAction`).
- `components/inbox-mark-read-on-outbound-toggle.tsx` — `"use client"`, props
  `{ workspaceId; inboxId; variant: "card" | "inline" }`; value from `useInboxes(workspaceId)`
  (disabled while loading), `useAction(action.bind(null, workspaceId, inboxId))`, on success
  `useInvalidateInboxes()` + toast (invariant 21). `card` = `TagSyncCard` layout; `inline` =
  Switch + label (TikTok cell). All copy via `useTranslations()`.
- Placement: Messenger/Instagram/Webchat edit forms — a form-bound card field
  (`MarkReadOnOutboundField`, `SwitchField`) saved by the page's Update button through the
  channel's update action → `inboxService.updateMarkReadOnOutbound`; the edit page loads the
  inbox flag server-side. WhatsApp/Zalo/Telegram/TikTok manage tables — the self-saving
  `InboxMarkReadOnOutboundSwitch` (new `TableCell`, bump empty-row `colSpan`). The switch
  label shows the state (`enabled`/`disabled` keys). **TikTok**: add `inboxId` to `integrationTiktokResource` and `toResource`.
- i18n: keys under the inbox namespace in `apps/builder/messages/en.json` (e.g.
  `inboxes.markReadOnOutbound.label` / `.description`), mirrored into **all 20 locale files**
  (`i18n:check` runs in `pnpm lint`). Toasts reuse `messages.updatedSuccess` / `messages.unknownError`.
- Authorization: `workspaceActionClient` (workspace member) — same level as the tag-sync toggle.

## 4. Implementation phases (TDD — failing test first)

### Phase 1 — Database
- [ ] Column + migration under `packages/database/drizzle/`; inspect SQL; **wait for approval before `db:migrate`**.
- [ ] Fix `InboxModel` fixtures flagged by type-check.

### Phase 2 — Business
- [ ] `packages/business/__tests__/conversation-service.test.ts`: advances when null / older; no-op when equal / newer; no-op when inbox flag false; no-op for foreign workspace or foreign inbox; invalidate + broadcast only when a row changed; returns boolean.
- [ ] `markReadByOutbound`.
- [ ] `InboxService.updateMarkReadOnOutbound` + test (scoped, not-found throws).

### Phase 3 — Worker
- [ ] `apps/worker/__tests__/send-message-handler.test.ts` (`sendMessageToChannel`): DM with `sentCount > 0` → `markReadByOutbound` called with `contactInbox.inboxId` / `message.createdAt`; `sentCount: 0` success result → not called; reconciled failure (`{ sentCount: 0 }` from catch) → not called; thrown failure → not called; public comment reply (`type: "comment"`, no `isPrivateReply`) → not called; private comment reply (`isPrivateReply: true`, delivered) → called on the DM conversation; `broadcastId` metadata → not called; rejecting service → send still succeeds, no retry.
- [x] `comment-automation/ai-reply` inline private reply → excluded by construction (see §3.4); no vacuous test added.
- [ ] `sendFlowStep` tests: flow DM delivered → called; `sentCount: 0` → not called; `broadcastId` → not called; public comment anchor → routed to `sendMessageToChannel` and not called; `message` absent → not called. Template handlers (`send-*-template.ts`) → never call it (regression test proving D2).
- [ ] `packages/business` precedence test: `markUnread` then `markReadByOutbound(readAt = reply.createdAt)` → advanced; `markReadByOutbound` then `markUnread` → older/null value kept.
- [ ] `apps/worker/__tests__/received-message.test.ts` (extend :730): new outgoing DM echo → called with `inbox.id`, echo `createdAt`; inbound → not called; `isNew: false` echo → not called; comment echo → not called; rejection logged and swallowed.
- [ ] Wire the three call sites.

### Phase 4 — Builder
- [ ] `is-conversation-unread` unit test → helper → `conversation-item.tsx`; extend `conversation-item.test.tsx` (bold/ring for unread vs read).
- [ ] `applyAgentLastReadAt` store tests (older event ignored, newer applied, null ignored, multiple ids) → `conversationUpdated` handler; `chat-realtime.test.tsx` nine → ten.
- [ ] D3 `build-conversation-where` test (never-read included) → fix.
- [ ] `placeConversation` tests (§3.7) → refactor the three writers → row select prepends + scrolls to top.
- [ ] TikTok `inboxId` in resource/mapper (+ data-shape test); action + toggle component (+ test: value from inbox list, action call, invalidate, disabled states) → seven surfaces → 20 locales.

### Phase 5 — Verification
- [ ] `pnpm fix`, `pnpm lint`, `check-types` for builder/worker/business, `pnpm test` in touched workspaces.
- [ ] `invariant-guard`, `code-reviewer`; Codex review of the PR.
- [ ] Browser (Chrome MCP) on the running builder: toggle on Messenger edit page (loading/disabled/success/error, survives reload); inline switch in Zalo/Telegram/TikTok/WhatsApp tables; unread rows bold + ring, clear on open; open a conversation → it moves to top and stays while another conversation receives a message (slots in at #2); real bot reply with option ON vs OFF updates live; 375 px width.

## 5. Files touched

- `packages/database/src/schema/inbox.ts`, `packages/database/drizzle/<ts>_add_inbox_mark_read_on_outbound/`
- `packages/business/src/conversation/service.ts`, `packages/business/src/inbox/service.ts`, tests
- `apps/worker/src/chat/handlers/send-message.ts` (eligibility rule + wrapper + call site 1), `apps/worker/src/chat/handlers/send-flow-step.ts` (call site 2), `apps/worker/src/integration/handlers/received-message.ts` (call site 3), worker tests
- `apps/builder/src/features/conversations/conversation-item.tsx`, `…/conversations/lib/is-conversation-unread.ts` (new), `…/conversations/conversation-list.tsx`, `…/conversations/queries/build-conversation-where.ts`
- `apps/builder/src/features/chat/store/chat-store.ts`, `apps/builder/src/features/chat/chat-realtime.tsx`
- `apps/builder/src/features/inboxes/actions/update-mark-read-on-outbound.action.ts` (new), `…/inboxes/components/inbox-mark-read-on-outbound-toggle.tsx` (new)
- `apps/builder/src/features/integration-tiktok/schema/resource.ts`, `…/integration-tiktok/queries/index.ts`
- `update-messenger-form.tsx`, `update-instagram-form.tsx`, `update-webchat-form.tsx`, `whatsapp-manage.tsx`, `zalo-manage.tsx`, `telegram-manage.tsx`, `tiktok-manage.tsx`
- `apps/builder/messages/*.json` (20), builder tests listed above

## 6. Risks

| Risk | Level | Mitigation |
|---|---|---|
| Fixing `isUnread` makes many rows bold that were silently "read" | MEDIUM (visible) | It is the server's definition; call out in PR |
| Cross-inbox: reply on inbox A clears unread from inbox B | LOW | Accepted (one thread per contact); documented in §1.6 |
| Delayed native echo (TikTok 2 s) stamped after a later customer message | LOW | Narrow window; documented; provider timestamps as follow-up |
| Pinned active row breaks strict `lastActivityAt` order until refetch | LOW | Explicit requirement; server order restored on next fetch |
| Row-select prepend + scroll-to-top feels jumpy | LOW | Verified in browser (Phase 5); `behavior: "smooth"` |
| Extra zero-row UPDATE per DM send when OFF | LOW | PK-scoped; excluded from broadcasts/templates |
| 20 locale files | LOW | `i18n:check` in lint |
| Client read timestamp diverges from the server's | — | Resolved: `readConversationAction` returns the persisted value; the client applies it via `applyAgentLastReadAt` and never synthesizes one |
| Row + thread pane both mark the same conversation read | — | Resolved: one module-wide in-flight request per conversation (`useMarkConversationRead`) |
| Own media send echoed before its `sourceId` is persisted | LOW | Matched by attachment file-type signature (`isSameOwnSendContent`); classification failure fails closed on read state (activity still recorded) |
| Flow step: `Promise.all` couples the channel send with realtime broadcasts | LOW | Unchanged by design: broadcasts catch internally and resolve `null`, and the existing catch already treats any rejection as a failed send (`message:failed`) — the read hook follows that verdict |
| Form-bound toggle saved with the integration update is not one transaction | LOW | Accepted: on inbox-update failure the page toasts and the form can be resubmitted; composing both writes needs a business-level method (follow-up) |
| Raw contact-filter SQL restates the unread predicate | LOW | Pre-existing raw SQL (`contact-filter/index.ts`); `conversationUnreadWhere` is the relational source; unify in a follow-up |

## 7. Decisions (resolved)

D1 include native echoes — **yes**. D2 exclude broadcast/template — **yes (by hook placement)**.
D3 fix Unread tab — **yes**. D4 WhatsApp toggle in table — **yes**. Public comment replies — **excluded**; private comment replies with a row — **included**; inline AI private replies — **excluded (no row)**.
System/bot DMs via `sendChannelMessage` (minigame, questionnaire, appointment, story-reply) — **included**.
Delivery after a manual *mark unread* — **delivery wins** (§3.4). Cross-tab *mark unread* — **unsupported, as today** (§3.5).
Active conversation — **pinned at top; every message kind still bubbles up**.

## 8. Complexity: MEDIUM — DB 0.5 h · business 2 h · worker 2.5 h · builder 5 h · verification 2 h.
