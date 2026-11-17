# WhatsApp Business-app echoes (`smb_message_echoes`)

A business onboarded to Coexistence can keep chatting from the WhatsApp Business
app (or a linked device). Meta mirrors every message it sends, and every edit
or revoke it makes, to the webhook field `smb_message_echoes`, one
`message_echoes[]` item each. This page covers how
those messages reach the inbox. The one-off history import that Coexistence also
runs (`history`, `smb_app_state_sync`) is a different path and is not described
here.

Meta reference: "smb_message_echoes webhook reference" and "Onboard WhatsApp
Business app users" (developers.facebook.com, WhatsApp Business Platform).

## Flow

```
Meta webhook (field smb_message_echoes)
  -> integrations/whatsapp/src/handlers/webhook.ts   extractSmbMessageEchoPayloads
     (one strategy per echo kind: message / edit / revoke)
```

| Echo `type` | Job (queue `low`) | Effect |
|-------------|-------------------|--------|
| `text`, `image`, `video`, `document`, `audio`, `sticker`, any other | `incomingMessageEcho` | Stored as an outgoing first-party message; see below. |
| `edit` | `updateIncomingMessage` | Replaces the text (the body, or the caption of a media message) of the message named by `edit.original_message_id`, and publishes `messageUpdated`. An edit with no text is skipped with an info log. |
| `revoke` | `deleteIncomingMessage` | Soft-deletes the message named by `revoke.original_message_id` and publishes `messageDeleted`, like a contact unsending a DM on Messenger. |

`edit` and `revoke` carry `retryIfMissing` and `lowPriority`: the message they
change may still be stored by its own job, so a missing row retries (6 attempts,
5s exponential backoff, longer than the 5 attempts of a sent message) and warns
once after the last attempt. The two flags are optional on those jobs; without
them (a Messenger unsend) a missing row only warns and the job runs on the
`integration` queue.

The row is changed at once, but the realtime event waits for the conversation's
message ingress lock (`ingress:conv:<conversationId>`, the lock a new message holds
while it is inserted and announced), so the inbox never receives an edit or an
unsend before the message it changes. The wait is capped at 10 s, the same budget
message ingress itself uses. If the lock is still held after that (the critical
section is a few database writes and one publish, so this means Redis or the
database is under stress), the event is published at once, as ingress degrades
too, and the inbox may keep the original text of that message until it reloads;
the stored message is correct either way.

A revoke hides the message (soft delete) and a counter or analytics event that
already counted it is not rolled back, while a later history import of the same
conversation only marks a revoked message `revoked: true` and keeps its text.
Two edits of one message end with whichever job applies last (known
limitation): when the original message is stored late, each edit retries on its
own backoff schedule, so the older edit can be applied after the newer one, and
two edits processed at the same moment can publish in the other order than they
were stored, so the inbox may show the other text until it reloads.

A sent message:

```
  -> job incomingMessageEcho (low queue), one per echo
  -> WhatsApp channel parser   handlers/message/incomming-message.ts (SMB echo branch)
  -> receiveMessage            apps/worker/src/integration/handlers/received-message.ts
  -> saveAndBroadcastMessage -> realtime `message.created`
```

It is the same job a Messenger echo uses, so the message is stored as an
outgoing first-party message, appears in the inbox and conversation list in
realtime, closes the human-reply window and runs outbound "Page" keyword
automation. It never starts inbound AI or flow automation.

## What a sent message stores

| Echo `type` | Handling |
|-------------|----------|
| `text` | Stored as an outgoing text message. |
| `image`, `video`, `document`, `audio`, `sticker` | Run through the same media parser as a customer's media (download and storage), but only the text, attachments and content attributes are kept. Needs the media `id` and `mime_type`. |
| any other type, or media missing a required field | Stored as the placeholder `[type]` (the text the history import also stores). |

## Identity and time

- The contact is keyed on the recipient's phone number (`to`) and carries the
  business-scoped user id (`to_user_id`, always present) as its second identity.
  `to` and the contact's `wa_id` are omitted for a customer who adopted a
  username; the contact is then keyed on the business-scoped id.
- The echo's `timestamp` is stored as the message time when it is within
  `PROVIDER_TIME_MAX_PAST_MS` / `PROVIDER_TIME_MAX_FUTURE_SKEW_MS` of now
  (`received-message.ts`); outside that window the receive time is used. A later
  history import of the same message only collapses with the live row when both
  carry the same timestamp.
- `ContactInbox.lastMessageAt` only moves forward.

## Operating notes

- A first message to a number ChatbotX has not seen creates a contact and
  conversation, even when Coexistence history sync is disabled. A business that
  chats with personal contacts from the phone will see those contacts appear.
- Deploy every worker before the builder. A sent message uses the existing
  `incomingMessageEcho` job, so an old worker accepts it and runs the old WhatsApp
  parser on it; that throws on every attempt and the failed job is then removed,
  so the echo is lost. The job is removed when it fails, so look for `Job has
  failed` log entries on the `low` queue whose `jobId` starts with `wa-smb-`, not
  for an `Unhandled ... job type` log. An edit or a revoke is a `low` job an old
  worker does not know: it logs `Unhandled low job type` and drops it.
- Rows staged by the old path before the deploy still flush through the history
  import.
- Known limitation: `receiveMessage` treats an outgoing message as an echo of a
  ChatbotX send when a pending outgoing row from the last 2 minutes (no provider
  id yet, or a failed send) has the same text or attachment type. A message typed
  on the phone with the same text in that window is then stored without realtime
  or native-app side effects. The same limit applies to Messenger echoes.
- A message that reaches the inbox after a newer one of the same conversation (a
  delayed echo) is stored at its own time; it neither replaces that newer message
  in the conversation list nor moves the conversation. A delayed message that is
  still its conversation's newest moves it to the top like any new message, even
  if another conversation had newer activity; the list order is exact again on
  reload.
