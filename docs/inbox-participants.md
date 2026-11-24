# Inbox participants (who replied)

Which workspace members replied in a conversation, shown in the Inbox: a line under the contact name ("A, B, C joined the conversation • latest reply time", click for each member's last reply), small avatars on the conversation row, and a member's avatar under their latest message.

## What counts as a reply

Anything a **member** sends to the customer from the Inbox or with a member token (mobile): typed messages, files and media, products, a flow, a single flow node, a WhatsApp or Messenger template, a call-permission request. It does **not** count when the sender is a bot, an automation, a broadcast, a system message, a page echo with no ChatbotX member, or an API call made with a **workspace token** (no member).

Only replies sent after the feature shipped are counted (no backfill); an older conversation fills in on its next reply.

## Data

`ConversationParticipant` (one row per conversation and member, `UNIQUE(conversationId, userId)`) with `lastRepliedAt` (nullable; `createdAt` is the first reply). Reads ignore rows whose `lastRepliedAt` is null. The table is drained before `Conversation` in the workspace purge. Deleting a user account cascades their rows (account deletion erases personal data); messages keep `senderId`, and the UI shows no avatar for an author it cannot resolve. A member removed from the workspace stays listed: it is history.

## Who sent each message

`resolveMessageAuthorUserId(message)` (`@chatbotx.io/database/partials`): `senderId` when `senderType` is `user`; otherwise `contentAttributes.sentByUserId`, which the worker stamps on a bot-typed row **a member started** (a manual flow step, a template step inside a manual flow, a member's direct template). `senderType` and `senderId` are not changed, so bot quota and analytics are unchanged. Automation rows and `sendChatMessage` rows are never stamped.

## Write path

`conversationParticipantService.recordReply` (upsert only, never rejects) is called from exactly two places:

1. `recordHumanMessageSent` in the worker's `send-message.ts`, after the channel accepted the message (composer text, files, products, private replies against the message's own conversation, member templates). It runs with the human-message analytics; a failure in one never skips the other.
2. The `flowId` branch of `createOutgoing`, after the flow job was enqueued ("send flow" / "send node").

The upsert is one statement and monotonic (`setWhere lastRepliedAt IS NULL OR lastRepliedAt < excluded`): a retry, a duplicate or an out-of-order event changes nothing.

## Read path and API

- `conversations.list` / `conversations.get` carry `recentParticipants` (latest 3: `userId`, `name`, `image`, `lastRepliedAt`), loaded in the same statement as the conversation (nested relation, no extra query).
- `conversations.listParticipants` (`GET /v1/conversations/{id}/participants`, `cursor` + `perPage`, default 50, max 100, newest first) returns everyone. Hidden from the default MCP tools; reachable with `search_tools`. The builder uses the private twin `listParticipantsAuthenticatedAPI`.

## Realtime

No new event. A member's reply arrives as the existing `messageCreated`; the client derives the author with `resolveMessageAuthorUserId`, looks the member up in the cached workspace members, and updates the row preview (`applyConversationParticipantReply`) and the participants query with the same idempotent merge as the server. A member missing from the cache is looked up in a fresh members list (never guessed); one still missing was removed, and the server's list is used. The server records the reply only once the channel accepted the message, so a failed or removed message that this tab counted refetches **that conversation's** first page and replaces its row preview (`replaceConversationRecentParticipants`); failures of messages never counted (broadcasts, automations) cost nothing. A message with an invalid time is ignored.

One known approximation: a member's flow is recorded once, when it is enqueued, but the tab sees its messages as they are sent, so a delayed flow can move its starter ahead of a member who replied in between until the next load, which shows the enqueue time. Recording every flow message would cost a database write each, so it is left as is.
