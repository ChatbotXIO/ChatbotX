# Failed outgoing messages

What happens to an outgoing `Message` row when the channel refuses it.

## The rule

| Who started the send | `sendFrom` on the job | Final failure |
|---|---|---|
| A workspace member in the builder's Inbox: composer (text, files, products, comment reply, private reply), a template, flow, booking link or WhatsApp call-permission request sent from a conversation, the **Resend** button | `"inbox"` | **Kept.** `sendError` is written and a realtime `messageFailed` shows the error on the bubble (with Resend where `isResendableMessage` allows it). |
| The Public API, CLI or MCP (member or workspace token), order notifications | `"api"` | **Removed** (hard delete, attachments too) and a realtime `messageRemoved` drops it from open timelines. The error goes to the workspace Error Log. |
| Automations: flows, triggers, keyword/default replies, AI agent, questionnaires, comment automation, minigame, templates from flows | absent | Removed, error in the Error Log. |
| Broadcasts and sequences | absent (bulk metadata) | Removed silently (no realtime), **no** Error Log row — the broadcast/sequence stats report it. |

Only the **final** failure settles the row. While BullMQ will still retry the job,
the row is left as it is (no error badge that would invite a duplicate Resend).
Rows that already carried a `sendError` before this rule are left untouched.

## How a send is recognised as "from the Inbox"

- `sendFrom` (`@chatbotx.io/utils/send-from`) is `"inbox" | "api"`. Every
  channel-policy check that used to read `sendFrom === "inbox"` (Messenger/Instagram
  human-agent tag, quick-reply retry/follow-up arming, the inbox send confirmation,
  the human-reply window) reads `isManualSend(sendFrom)`, so `"api"` behaves as it
  did when the API sent `"inbox"`.
- `createOutgoing`, `resendOutgoing`, `sendInboxBookingLink`,
  `requestWhatsappCallPermission` and the builder's `sendWhatsappTemplateToConversation`
  take a **required** `sendFrom`: builder actions and the session-auth private route
  pass `"inbox"`, public procedures and `order/service.ts` pass `"api"`.
- A row created for an Inbox send is stamped `contentAttributes.sentFromInbox = true`
  (`SENT_FROM_INBOX_KEY`, `isSentFromInbox` in `@chatbotx.io/database/partials`):
  `createOutgoing`, flow steps of a flow sent from the Inbox, and template rows. A retry
  or a late delivery-status callback reads the stamp, not the job.

Keep rule: `sendFrom === "inbox" || isSentFromInbox(message.contentAttributes)`.

## Where it is applied

One worker function, `settleFailedOutgoingMessage`
(`apps/worker/src/chat/handlers/send-message.ts`), used by:

- `sendMessageToChannel` (composer, API, order notifications, AI/keyword text
  replies via `sendChatMessage`, public comment replies, minigame);
- `sendFlowStep`'s failure catch (flows, triggers, broadcasts, sequences);
- the WhatsApp and Messenger template senders through `settleFailedTemplateMessage`:
  they insert a new row per attempt, so an attempt BullMQ will retry removes its own
  row and a retried template never leaves duplicates;
- a provider's async `failed` delivery status (`integration/handlers/message-status.ts`),
  after the WhatsApp template "Failed" status branch has run;
- the bot-quota gate (`record-quota-skipped-send.ts`), which also writes the Error Log
  row itself because no `message:failed` is emitted there;
- `createOutgoing`'s enqueue failure ("Could not queue the message for delivery"):
  kept for `"inbox"`, removed for `"api"` (the API caller gets the error back).

`message:failed` is still emitted wherever it was; the
`record-provider-error-log.ts` listener writes the Error Log row on the terminal
emission and skips bulk sends. Its listeners never read the `Message` row, so removing
the row right after the emit is safe.

Sends that create no row log to the Error Log directly: an AI private reply of a
comment automation (`settleAIReplyFailed`) and the SMTP email step (`smtp` provider,
shown as "Email").

## Client side

`messageRemoved` (`{ messageIds }`, conversation-routed) is handled by
`chat-realtime.tsx` → `removeMessages(ids)` in the chat store: the rows leave the open
timeline with no "deleted" placeholder; the open conversation's list preview falls back
to its last remaining message, other conversations keep theirs until the list reloads.
`messageDeleted` (a member's unsend, rendered as "The message has been deleted.") is
unchanged.
