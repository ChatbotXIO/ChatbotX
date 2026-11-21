# Inbox translation

Two-way translation of direct text messages in the Inbox, using an AI integration and model the workspace admin chooses. Customers write in their language; agents read and write in the workspace language.

Plan and decisions: `docs/translate/2026-11-19-inbox-bidirectional-translation.vi.md`.

## What it does

| Direction | When it runs | Result |
|---|---|---|
| Inbound (customer → agent) | Only when a member **opens** the conversation or scrolls back to older messages (each page of 20 loaded messages is requested once; messages from before the feature was turned on are included), or an AI agent calls `translation.requestMessages`. Never in the background and never on receive. | A `MessageTranslation` row per message; the bubble shows the translation with a small muted row under it (the language and an arrow: "Vietnamese ⌄"; the tooltip says "Translated from Vietnamese" or, on an agent's own message, "Sent in Vietnamese"). The row opens the original (or what the customer received); "Show original text" in the composer's translation settings opens them all. Both are per tab and not remembered. `messageTranslationUpdated` realtime event. |
| Outbound (agent → customer) | The Inbox composer or `messages.create` with `translate: true`. Waits **at most 10 s**. | The customer receives the translation; the agent's own sentence is kept in `MessageTranslation.displayText`. When the translation fails or takes longer than 10 s **nothing is sent** (`translationNotSent`); the agent sends again. |

Out of scope in v1: automatic translation on receive, background translation of history (older messages are translated when someone opens the conversation or scrolls back to them), media/rich messages, comment/private/story replies, flows/broadcasts/automations, mobile UI, search by the original sentence.

## Switches

1. **Workspace setting** (`InboxTranslationSettings`, Settings → General → "Inbox translation"). Admin only. Needs a connected, enabled AI integration and a model. The workspace pays with its own AI key, and customer chat text is sent to that provider: the card says so.
2. **Per conversation** (`Conversation.additionalAttributes.translation`): `enabledOverride` (`false` turns it off for this conversation, `true` turns it on in the Inbox while the bot is on duty, see below) and `language`. A conversation can opt out but cannot opt in on a workspace that has it off.

`status` in the settings resource is `active`, `needsReconfiguration` (the integration was removed or disabled, no foreign key, revalidated on every call) or `disabled`.

## While the bot is on duty

In the Inbox, a conversation the bot is on duty for is **not translated at all** until an agent turns translation on in its popover, and its bubbles show the original text only. The bot is on duty when the conversation shows "Bot is active" (bot enabled and the thread not on standby), and also when an agent took it over for a while (`botEnabled: false` with a `botResumeAt`: turning "Bot is active" off, or the 24-hour pause after an agent's reply). Agents often only answer in the bot's place and hand it back, so taking the bot over does **not** turn translation on. A bot that is off for good (`botResumeAt` empty) leaves translation on.

Turning translation on saves `enabledOverride: true` on the conversation (it also translates older messages that load afterwards and new ones, survives a reload, and shows in every open inbox). Turning it off saves `false`. Either choice wins over the bot rule. When the bot takes the conversation back (`conversationService.updateBotEnabled(true)`: "Enable bot", the API, an AI agent, or `ensureActive` resuming it), the server drops a `true` in the same UPDATE, so the next takeover starts off again; a `false` and the language stay. The popover hint says why it is off ("The bot is handling this conversation…" or "You took this conversation over from the bot…"). The messaging-window notice (no composer) keeps the same chip and popover.

This is an Inbox rule only: the API, the CLI and the AI agent translate whenever they call `translation.requestMessages` or send with `translate: true`, bot or not. The first reply an agent sends in a bot-active conversation goes out as written (sending also pauses the bot for 24 hours, which keeps translation off), unless translation was turned on first.

## Language

- The workspace language is `Workspace.language`. Customer text is translated into it; agents write in it.
- The customer's language is set **once** per conversation and then kept: detection by the model on the first reliable message (confidence ≥ 0.8 and either ≥ 3 words, or a shorter message with distinctive spelling: ≥ 4 letters with at least one outside A–Z, such as "làm sao?"; plain ASCII words like "ok" or "thanks" never decide; ≥ 12 characters for languages written without spaces), or by an agent by hand. A manual language is never overwritten by detection. A customer who switches language is not followed; the agent changes it by hand.
- Codes are normalised (`zh-Hans`/`zh-Hant` stay apart, everything else keeps its primary subtag). Text already in the workspace language is skipped, not translated.
- URLs, emails, phone numbers, numbers, emoji-only and similar "noise" are never sent to the model (`noise-filter.ts`).

## Data flow

```
member opens conversation / AI agent calls translation.requestMessages
  → builder: request-guard (workspace on, conversation on,
             ≤ 20 messages, Redis in-flight marker)
  → BullMQ `aiAgent` queue, job `translateMessages`, priority 3 (lower than an AI reply)
  → worker handler: translate in batches of ≤ 10 (3 earlier messages as context), two batches at a time,
             upsert MessageTranslation, setLanguageIfUnset, publish messageTranslationUpdated
  → member tabs: chat store applies the items
```

- **In-flight marker** `inflight:<workspaceId>:<messageId>` = `requestId`, `SET NX EX 180`; the worker renews before each provider call and releases with a compare-and-delete. A duplicate request is a no-op.
- **Retry:** 3 attempts for transient provider errors; config errors and `unsafeOutput` are `UnrecoverableError` (no retry). The provider call has a 15 s timeout. Outbound never retries. Only an integration that is missing, disabled or unusable as configured is `integrationUnavailable`; a database or network error while reading it, or a shard that cannot be read, throws as itself and the job retries.
- **Malformed batch answer.** When the model's answer for a batch does not cover its messages, each message is translated on its own; a message it still cannot answer is stored as `failed` (`providerError`, with Retry) and the rest of the batch is kept. Only a batch where no message gets an answer is retried.
- **Shared queue.** Translation runs on the existing `aiAgent` queue and worker. A burst of AI replies can delay it; the UI shows "Translating…" for up to 30 s, then "Couldn't translate" with a retry button.
- **Protection of fragments.** Placeholders `⟦n⟧` mask names, links and numbers before the call and restore them after. If the model drops or invents one, the result is stored as `unsafeOutput` and not shown. Message text is untrusted data: no tools, no instructions followed.
- **Edited text.** Each row carries a `sourceHash`. If a customer edits a message while the job runs, the result for the old text is dropped, and so is a failure of it: a `failed` row is stored only for a message the job still holds the marker of and whose text is unchanged, and the repository never lets a `failed` result replace a good row for other text in the same language. An edit or unsend removes the row.

## Outbound details

- The composer shows the target language as a chip. Its popover is the conversation's "Translation settings": the on/off switch for this conversation, the customer's language, and the display options (original text, preview before sending). When previews are on, nothing is translated while the agent types: the first Enter (or Send) translates and opens the "Customer preview" panel, the next Enter sends what it shows, and a failed preview does not block sending (the server translates as it would without a preview). The panel shows the translation read-only before sending (a check icon when it is ready, "Edit" to change it by hand, "Translate again" to redo it); the agent can edit it. The reviewed text goes out as `editedTranslation` and is used only if `targetLanguage` still matches the conversation language, otherwise it is discarded and translated again (`editedTranslationDiscarded`).
- An outgoing sentence, the preview and the settings test use a **plain-text** model call (no JSON schema, no language detection) to keep agents waiting as little as possible; inbound batches use structured output because they also detect the language. A slow model (`slow: true` in the settings test, above 5 s) risks missing the 10 s budget, and a message that misses it is not sent.
- **Choosing a model.** Median time of one agent sentence (measured, one network and day, so read it as an order of magnitude; the call to the provider dominates and varies by 1-2 s): Gemini 3.5 Flash-Lite 0.7 s, Claude Haiku 4.5 0.8 s, GPT-4.1 / GPT-4.1 mini 0.8-1.0 s, Gemini 3.5 and 3.6 Flash 1.2-1.3 s, Claude Sonnet 4.6 1.4 s, Gemini 3.7 and 3.8 Flash 2.1-2.4 s, Gemini 3.1 Pro 6-12 s (it cannot stop thinking). Every second of it is a second the agent's message waits behind "Translating…". Gemini Flash models that think are called with their lowest thinking level (`translationProviderOptions` in `packages/ai`); without it Gemini 3.5 Flash needs 3.4 s and 3.7/3.8 Flash 6 s.
- Only a **plain text** message translates: no files, media, products, flow, reply, private reply or comment. Over a channel's length limit (`TRANSLATION_CHANNEL_MAX_LENGTH`, strictest limit for an unknown channel) the message is not sent (`tooLong`).
- `translationFallback` on the created message only says why a message went out **as written** without being a failure: translation is off for the conversation (`disabled`) or the customer's language is unknown (`unknownLanguage`).
- **A failed translation is never sent.** No answer within 10 s (`timeout`, a late answer is discarded), `providerError`, `integrationUnavailable`, `rateLimited`, `emptyOutput`, `unsafeOutput`, `tooLong` or `notConfigured`: no `Message` row is created and the send fails with `translationNotSent` (422, `data.reason`, `data.conversationTranslation`). The server action returns the same as `{ translationNotSent }` data. Nothing is retried and the original is never sent in its place.
- **The AI provider's API failing turns translation off for the conversation.** `providerError` and `integrationUnavailable` (`TRANSLATION_PROVIDER_FAILURE_CODES`) also set `enabledOverride: false` through `updateConversationTranslationState`, which tells every open inbox (`messageTranslationUpdated` with `conversationEnabledOverride`), and answer `conversationTranslation: "off"`: the next message goes out as written. An agent turns it back on in "Translation settings" (or `translation.updateConversationState` with `enabledOverride: true`, or `null` for the default). A timeout, a rate limit or an unusable answer leaves it on. If the turn-off write fails the message is still not sent and the answer says `"on"`.
- **In the Inbox.** While the server waits, the agent's bubble shows "Translating…"; a message that was not sent shows "Translation failed" under it (no toast, no Resend: the composer stays open and the agent sends the text again as a new message). That state is tab-only (`useTranslationUiStore().outgoing`, by `clientId`) and is gone after a reload. When translation was turned off, the messages still queued to be translated are marked "Translation failed" too, so none of them reaches the customer as written, and a short notice says "Translation unavailable. Translation has been turned off for this conversation."
- What the customer received is `Message.text`. What the agent typed is `translation.displayText` and is **never** in `contentAttributes` or the `messageCreated` payload, so a guest (webchat) can never read it. `messageTranslationUpdated` is a member-only event; guest history is built with `includeTranslation: false`.

## Public API, CLI, MCP

All under router key `translation` / tag `Translation`; every operation is a procedure in `apps/builder/src/features/translation/api/public.ts`, and the UI calls the same functions (invariant 23).

| Operation | Route | Scope | CLI |
|---|---|---|---|
| `translation.getSettings` | `GET /v1/translation/settings` | `settings` or `inbox` | `translation settings get` |
| `translation.updateSettings` | `PUT /v1/translation/settings` | `settings` | `translation settings update` |
| `translation.testSettings` | `POST /v1/translation/settings/test` | `settings` | `translation settings-test` |
| `translation.getConversationState` | `GET /v1/conversations/{conversationId}/translation` | `inbox` | `conversations translation list` |
| `translation.updateConversationState` | `PUT /v1/conversations/{conversationId}/translation` | `inbox` | `conversations translation update` |
| `translation.requestMessages` | `POST /v1/conversations/{conversationId}/translation/requests` | `inbox` | `conversations translation request` |
| `translation.previewText` | `POST /v1/conversations/{conversationId}/translation/preview` | `inbox` | `conversations translation preview` |

Also: `messages.create` takes `translate` and `editedTranslation`; `messages.list` takes `includeTranslation` and returns `translation` per message.

An AI agent that never calls `translation.requestMessages` gets no inbound translation; that is deliberate (no background cost). The MCP guide `inbox-and-handover.md` says so. Conversation routes run the same member-scope check as the other conversation routes (`assertConversationAccessForCaller`).

## Data

| Table | Purpose | Lifecycle |
|---|---|---|
| `InboxTranslationSettings` | One row per workspace: switch, `modelConfig`, `enabledAt` (first time switched on; informational, not a translation boundary). | Cascades with the workspace. |
| `MessageTranslation` | One row per translated message, unique on `(workspaceId, messageId)`. Never `pending` and never for noise or text already in the workspace language. | Workspace purge drains it in `HEAVY_WORKSPACE_TABLES` (before `Conversation`); contact deletion cascades through `Conversation`; an edit/unsend deletes the row, and so does deleting the message (`messageService.delete` / `hardDelete`, after the message write, idempotent so a retry finishes it). No retention job (`Message` has none either). |

About 0.4 KB per row with its indexes (~400 MB per million rows). Add a `chunkedPurge` retention cron, modelled on `purgeErrorLogs`, if it ever grows.

`Conversation.additionalAttributes` is written with `jsonb_set` (one key at a time, `conversationService.setTranslationOverride/Language/LanguageIfUnset`), so translation state does not overwrite `challenge` or `channelConversationId` written concurrently.

## Privacy and cost

- Customer text goes to the AI provider the admin picked, billed to that workspace's key. There is no per-workspace limit: turning it on accepts the cost.
- Logs never contain message text; errors are logged as `{ err }` with `workspaceId`, `conversationId` and a reason code.
- A conversation that nobody opens costs nothing. Opening an old one, or scrolling back through it, costs up to two model calls per 20 messages that have no translation row yet; messages already in the workspace language are stored as `skipped` once and not sent again.

## Operations

- **Turn off now:** switch the workspace setting off (Settings → General, or `translation settings update --enabled false`). There is no platform-wide switch: to stop translation everywhere, turn off each workspace's setting. No database action is needed.
- **Remove the feature:** drop `MessageTranslation` and `InboxTranslationSettings`, then their three enum types. No existing table was altered.
- **Watch:** the share of `unsafeOutput` failures (especially right-to-left languages) and of `skipped` messages in the job logs. Above ~50% skipped, add a cheap language pre-filter in the worker.
- **Known v1 limits:** another member's tab briefly shows the translated text as the bubble before `messageTranslationUpdated` arrives; the conversation list preview of an outbound message is the translation the customer got.
