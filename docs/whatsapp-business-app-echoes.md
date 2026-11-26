# WhatsApp Business-app echoes (`smb_message_echoes`)

A business onboarded to Coexistence can keep chatting from the WhatsApp Business
app (or a linked device). Meta mirrors every message it sends, and every edit or
revoke it makes, to the webhook field `smb_message_echoes`, one
`message_echoes[]` item each. This page covers how they reach the inbox. The
one-off history import that Coexistence also runs (`history`,
`smb_app_state_sync`) is a different path and is not described here.

Meta reference: "smb_message_echoes webhook reference" and "Onboard WhatsApp
Business app users" (developers.facebook.com, WhatsApp Business Platform).

## Flow

`extractSmbMessageEchoPayloads` (`integrations/whatsapp/src/handlers/webhook.ts`)
turns each echo into one job, chosen by its kind:

| Echo `type` | Job (queue) | Effect |
|-------------|-------------|--------|
| `text`, `image`, `video`, `document`, `audio`, `sticker`, any other | `incomingMessageEcho` (`low`) | Stored as an outgoing first-party message, see below. |
| `edit` | `updateIncomingMessage` (`integration`) | Replaces the text (the body, or the caption of a media message; an empty caption clears it) of the message named by `edit.original_message_id` and publishes `messageUpdated`. An edit with no text is skipped with an info log. |
| `revoke` | `deleteIncomingMessage` (`integration`) | Soft-deletes the message named by `revoke.original_message_id` and publishes `messageDeleted`, like a contact unsending a DM on Messenger. |

An edit or a revoke carries `retryIfMissing`: the message it changes may still
be stored by its own job, so a missing row retries (6 attempts, 5s exponential
backoff, longer than the 5 attempts of a sent message) and warns once after the
last attempt, and its realtime event waits for the conversation's message ingress
lock (`ingress:conv:<conversationId>`), so the inbox normally receives the
message before the change. This is best effort: the wait is capped at 10 s, as
message ingress itself is, and after that the event is published at once. A Messenger unsend or a comment edit
does not set the flag and behaves as before.

A sent message:

```
  -> job incomingMessageEcho (low queue), one per echo
  -> WhatsApp channel parser   handlers/message/incomming-message.ts (SMB echo branch)
  -> receiveMessage            apps/worker/src/integration/handlers/received-message.ts
  -> saveAndBroadcastMessage -> realtime `message.created`
```

It is the job a Messenger echo uses, so the message is stored as an outgoing
first-party message at the time the worker receives it, appears in the inbox and
conversation list in realtime, closes the human-reply window and runs outbound
"Page" keyword automation. It never starts inbound AI or flow automation.

## What a sent message stores

| Echo `type` | Handling |
|-------------|----------|
| `text` | Stored as an outgoing text message. |
| `image`, `video`, `document`, `audio`, `sticker` | Run through the same media parser as a customer's media (download and storage); only the text, attachments and content attributes are kept. Needs the media `id` and `mime_type`. |
| any other type, or media missing a required field | Stored as the placeholder `[type]` (the text the history import also stores). |

The contact is keyed on the recipient's phone number (`to`) and carries the
business-scoped user id (`to_user_id`, always present). `to` is omitted for a
customer who adopted a username; the contact is then keyed on the business-scoped
id.

## Operating notes

- A first message to a number ChatbotX has not seen creates a contact and
  conversation, even when Coexistence history sync is disabled.
- An edit or a revoke is only applied from a signature-verified delivery. A manual
  integration without an app secret still stores sent messages but ignores edits
  and revokes.
- Deploy every worker before the builder. An old worker runs the old WhatsApp
  parser on a new `incomingMessageEcho` job, which throws on every attempt and is
  then removed (look for `Job has failed` entries whose `jobId` starts with
  `wa-smb-`), and it does not know `updateIncomingMessage` (it logs `Unhandled
  integration job type` and drops it).
- Rows staged by the old path before the deploy still flush through the history
  import.
- Known limitations:
  - A revoke hides the message (soft delete); counters that already counted it
    are not rolled back, and a later history import only marks a revoked message
    `revoked: true`.
  - Two edits of one message end with whichever job applies last; when they run
    at the same moment the inbox may show the other text until it reloads.
  - `receiveMessage` treats an outgoing message as an echo of a ChatbotX send when
    a pending outgoing row from the last 2 minutes has the same text or
    attachment type; such a message is stored without realtime or native-app side
    effects. The same limit applies to Messenger echoes.
