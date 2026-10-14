# Inbound Webhooks

An inbound webhook lets any external system (a store, a form, a CRM) `POST` JSON to a private URL to **find or create a contact, save values on it and run actions** — without a middleware such as Zapier. It is the receiving counterpart of the outbound `Webhook` feature.

- Builder: **Tools → Inbound Webhooks** (`/space/{workspaceId}/inbound-webhooks`), permission `superAdmin`.
- Public API: `inboundWebhooks.*` and `inboundWebhookChannels.list` (scope `integrations`). Every UI action has an operation, so an agent can configure and test a webhook end to end.
- Code: `packages/business/src/inbound-webhook/`, `packages/database/src/{schema,repositories}/inbound-webhook*`, `apps/worker/src/default/handlers/process-inbound-webhook-request.ts`, `apps/builder/src/features/inbound-webhooks/`, route `apps/builder/src/app/api/hooks/[token]/route.ts`.

## The endpoint

```
POST {app URL}/api/hooks/{token}
Content-Type: application/json
Idempotency-Key: <optional, ≤ 255 chars>
```

The token (`iwh_…`, 43 random characters) **is the credential**: there is no signature. It is stored raw so the owner can copy the link again, and is never returned by `list` or to a `read_only` API token (anyone holding the URL can run the webhook's actions). *Regenerate* replaces it; the old URL stops working within 10 seconds (see below).

**Operators:** the token is part of the request path. Mask `/api/hooks/*` in reverse-proxy and APM access logs. The application itself never logs the token, the URL or the payload. The token lookup is cached in Redis for 10 seconds as a four-field record (id, workspace, active, configured) — not the configuration or sample — with one entry (plus its invalidation tag) per webhook. Each stored request also keeps the caller's IP address and `User-Agent` (truncated to 512 characters) for support and abuse tracing; they are never shown in the builder or returned by the API, and are deleted with the request after 30 days.

| Status | `code` | Meaning |
|---|---|---|
| `202` | — | Accepted and stored; processed asynchronously. Body `{ accepted: true, requestId }` |
| `200` | — | Duplicate (same `Idempotency-Key`) — nothing new was stored. Body `{ accepted: true, duplicate: true }` |
| `400` | `INVALID_JSON` | Body is not a JSON object/array (or holds text a database cannot store) |
| `400` | `INVALID_IDEMPOTENCY_KEY` | `Idempotency-Key` is longer than 255 characters |
| `403` | `WEBHOOK_INACTIVE` | Webhook inactive or not fully configured |
| `403` | `WORKSPACE_BLOCKED` | The workspace owner is blocked |
| `404` | `NOT_FOUND` | Unknown or malformed token |
| `405` | — | Anything but `POST` (`Allow: POST`) |
| `410` | `WORKSPACE_UNAVAILABLE` | Workspace deleted or scheduled for deletion |
| `413` | `PAYLOAD_TOO_LARGE` | Body larger than 256 KiB |
| `429` | `RATE_LIMITED` | Rate limited (`Retry-After` set): 300 / 10 s per IP (a coarser shared bucket when no client IP is available) and 600 / 10 s per webhook |
| `500` | `SYSTEM_ERROR` | Unexpected error — safe to retry |

Every error body is `{ "accepted": false, "code": "<CODE>", "message": "<text>" }`. Branch on `code`; the message is for humans and may change.

`202` means *stored*, not *processed*. Read the outcome in the request log.

### Duplicates

- With an `Idempotency-Key`, a repeated key is always a duplicate (unique per webhook, kept as long as the request is).
- Without one, every delivery is processed, **including an identical body sent again**: a customer's second order or a re-sent form is a new event and runs its mappings and actions again. Senders that retry on timeouts and cannot tolerate a repeat should send a key.

## Choosing the inbox

In ChatbotX one channel can have many inboxes and a contact must belong to one before a flow can be sent. A webhook therefore picks the inbox in one of two ways (`inboxResolution`):

- **Specific inbox** — `{ "mode": "inbox", "inboxId": "…" }`.
- **From payload** — `{ "mode": "payload", "channel", "identifierKind", "jsonPath" }`: read the channel's own inbox id from the payload.

| Channel | `identifierKind` (what the path must yield) | Channel user ID (`channelUserId`) | A new contact can be created from |
|---|---|---|---|
| Messenger | `pageId` — Facebook page id | PSID | `channelUserId` |
| Instagram | `igId` — Instagram account id | IGSID | `channelUserId` |
| WhatsApp | `phoneNumberId` (exact) or `displayPhoneNumber` (digits compared; ambiguous if two numbers share it) | `wa_id` (the phone's digits, with or without `+`) | `phone` |
| Telegram | `botId` | chat id | `channelUserId` |
| Zalo | `oaId` | user id | `channelUserId` |
| TikTok | `openId` (the connected account's open id) | customer open id | `channelUserId` |
| Threads | `threadsUserId` | username (lower-cased) | `channelUserId` |
| Webchat, SMTP, API | not resolvable from a payload — use a specific inbox | webchat: the visitor id the platform minted; SMTP: the address; API: the caller's id | webchat: `phone` or `email`; SMTP: `email`; API: `channelUserId` |

`GET /v1/inbound-webhook-channels` returns this table as data (source: `INBOUND_WEBHOOK_CHANNEL_SPECS` in `@chatbotx.io/utils`). Adding a channel is a compile error until its entry exists.

## Finding or creating the contact

The editor always shows four fields, in this order: **Channel user ID**, **Phone**, **Email**, **Full name**. At least one is required.

Identity is **scoped to the resolved inbox** and never merged across channels:

1. The contact is searched by **the first of the four that the request carries** (a value the channel cannot use, such as a WhatsApp ID with no digits, counts as absent). Only that one is queried: a miss never falls through to the next, because a looser key could match someone else on the same inbox and the flow would go to the wrong person. (The only exception is the duplicate guard in step 4 below.)
   - `channelUserId` → the contact whose connection id is that value on this inbox (PSID, IGSID, chat id, `wa_id`, …).
   - `phone` / `email` → on WhatsApp / SMTP the connection id they imply; on other channels the contact's phone / email on this inbox.
   - `fullName` → the contact on this inbox whose full name matches (compared with whitespace collapsed and trimmed). Names are not unique: when **two** contacts match, nothing is written or sent and the request is skipped as `contactAmbiguous`.
2. Found → that contact is used. **The four values are never written onto an existing contact** (use *Save incoming data* to update fields).
3. Not found → a new Contact + ContactInbox + Conversation is created on that inbox (contact source `inboundWebhook`), **only if** the request carries an identity the channel can address (the "can be created from" column above). Otherwise the request is skipped as `contactNotFound`. A contact with the same phone on another channel stays a different contact, as it does for an incoming message.
4. If the identity a new contact would be created from already belongs to a contact on the inbox — a WhatsApp `wa_id` that missed while the phone's digits are known, or a webchat visitor id that missed while the phone or email is known — that contact is used instead of creating a duplicate. Only the first creation identity the request carries is checked.
5. No usable identity at all → skipped as `missingIdentifier`.

A new contact's name starts from the *Full name* value; mapped `first_name` / `last_name` / `full_name` fields are laid over it, later rows winning.

Creation takes a per-inbox lock and re-checks inside it, so two deliveries for the same new person produce one contact.

## Saving a webhook

Every save (and every activation) must be complete: an inbox rule, **at least one** of the four contact fields and **at least one** *Save incoming data* mapping. The builder shows each missing part on its field; the API rejects the same cases with `validation.inboundWebhook.*` codes (`inboxRequired`, `identifierRequired`, `fieldMappingRequired`). `create` still makes an empty, inactive draft.

Whether the identities can also **create** a contact is not a save rule. A webhook that only updates existing contacts (by email, phone or name) is valid. When none of the channel's creation identities (the "can be created from" column above) is configured, the editor shows a note, and at runtime a request for an unknown contact is skipped as `contactNotFound` while requests for existing contacts still run.

## Saving values

`fieldMappings` copy payload values onto the contact. `target` is a system field (`first_name`, `last_name`, `full_name`, `email`, `phone`, `gender`) or a custom field id. JSON paths are written and stored in the `$` form (`$.customer.email`, `$.items[0].name`, `$["a-b"]`); bare paths such as `customer.email` are accepted and rewritten to it. Keys with quotes or other special characters use a JSON string inside the brackets (`$["say \"hi\""]`). Filters, wildcards and recursive descent are not supported. Rows already saved in another spelling keep working and are shown in the `$` form. Values are coerced like any custom-field write; a rejected value is reported per field (`fieldErrors`) and does not stop the others.

`POST /v1/inbound-webhooks/preview-mapping` runs the same extraction on a sample payload without writing anything.

## Actions

After the contact is saved the webhook runs its `actions` in order. They are the Trigger actions, limited to: `startAnotherFlow`, `addTag`, `removeTag`, `setCustomField`, `clearCustomField`, `transferConversationToHuman`. Meta CAPI, Google Ads and Sheets actions stay trigger-only because their dedup keys are scoped to a trigger.

## Processing guarantees

The stored `InboundWebhookRequest` row is the outbox.

- `received` → a worker claims it atomically (`processing`, with a claim token and a 15-minute lease) → `processed` / `completedWithErrors` / `skipped` / `failed`. Every later write is fenced by the claim token, so a worker that lost its claim cannot overwrite the new owner.
- The target contact and each action's result are checkpointed as they happen. A retry or a reclaim resumes from there instead of re-applying the payload or repeating finished actions; `startAnotherFlow` also carries a deterministic job id.
- A cron (every 5 minutes) re-enqueues requests that were never enqueued or whose worker died. After 24 hours it stops retrying and closes them as `failed` with `errorCode: "abandoned"`. A request whose processing hit an unexpected error carries `errorCode: "systemError"`; a business failure carries that error's code.
- Requests are kept 30 days. Payloads can contain personal data: the public `getRequest` only returns one with `includePayload=true`.

### Statuses and skip reasons

`processed` — everything ran. `completedWithErrors` — the contact was saved but a field value was rejected or an action failed/skipped. `skipped` — nothing could be applied: `webhookInactive`, `missingInboxIdentifier` (the path yielded nothing), `inboxNotFound`, `inboxAmbiguous`, `inboxDisconnected`, `missingIdentifier` (no usable identity), `contactNotFound` (nobody matched and the request cannot create one), `contactAmbiguous` (two contacts share the name the request is looked up by), `workspaceBlocked` (the owner is blocked; the request is closed so the re-dispatch scan skips it). `failed` — an infrastructure error after all attempts.

## Request counts and the analytics screen

The list shows how many requests each webhook has accepted since it was created (`requestCount`, also on `get` and `list`). A duplicate (same `Idempotency-Key`) is not counted, and the count moves in the same transaction as the stored request, so it cannot drift. Purging old request rows after 30 days never lowers it. Rows that existed when the counter was added were counted from the requests still retained then. The request log lives on its own screen — row menu → *View analytics* (`/space/{workspaceId}/inbound-webhooks/{id}/analytics`); agents read the same data with `listRequests` / `getRequest`.

## Limits

100 webhooks per workspace · 1–4 identifiers · 50 field mappings · 10 actions · JSON paths ≤ 500 characters · sample JSON ≤ 64 KiB · request body ≤ 256 KiB.

## Delivery guarantees and sender notes

- **At-least-once actions.** The request row is the outbox: each action is checkpointed after it runs, and a request is resumed after a crash from its last checkpoint. A worker that dies in the instant between an action's side effect and its checkpoint can therefore run that one action again on recovery. Flow starts use a deterministic queue job id per request and action, which absorbs the common retry; an action that is not naturally repeatable (for example appending to an account field) should be kept out of webhooks that must be exactly-once. A result recorded for an action that the owner has since replaced by an action of a different type does not count as done.
- **Retries.** A request whose processing hits an infrastructure error (a database restart, a lock timeout) is given back and retried by the re-dispatch cron for about 20 minutes before it is closed as `failed`; a business error (a 4xx, such as a quota or validation failure) closes it as `failed` at once.
- **Token changes take effect within 10 seconds.** The token lookup is cached for 10 seconds, so a URL that was just regenerated, deactivated or deleted can still be accepted briefly by a delivery already in flight.
- **Send ids as strings.** A numeric id above 2^53 (a PSID, page id or open id sent as a JSON number) is rounded by JSON parsing before the platform sees it, so it names a different account. Such a value is treated as absent and the request is skipped (`missingIdentifier` / `missingInboxIdentifier`) rather than creating a contact for an id that does not exist.
- **Bodies Postgres cannot store** (a NUL character, a lone surrogate, nesting deeper than 64 levels) are refused with `400 INVALID_JSON`; the same rule applies to the saved sample JSON.
