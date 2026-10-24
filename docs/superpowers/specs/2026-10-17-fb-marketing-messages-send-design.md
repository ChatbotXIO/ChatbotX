# FB Marketing Messages — Send campaign

> Status: DESIGN — awaiting written-spec approval before planning.
> Date: 2026-10-17
> Builds on: `2026-09-05-facebook-marketing-messages-design.md` (campaign + content),
> `2026-10-04-fb-marketing-messages-custom-audience-design.md` (audiences),
> commit b8d0aad90 (campaign `targetType` / `audienceId`).

## 1. Intent

A Marketing Messages campaign can be created today (Meta `message_campaign` +
our `FacebookMarketingMessage` row with authored `content` and a target), but
**nothing is ever delivered**. This spec makes campaigns actually send, track
what happened, and expose the whole feature to AI agents.

Success, from the merchant's point of view: a campaign they created shows a
**status**, **sent / delivered / failed counts**, and a **breakdown of errors**
— an hour after creation it is sending, the next day a daily campaign has
progressed further, and when it is done they can see why the failures failed.

### Goals

- Deliver the campaign's `content` to every subscription token of its target,
  once per token, via Meta's direct-send API.
- Respect the budget: a daily-budget campaign is spread over days; a
  lifetime-budget campaign is a single pass.
- Record the outcome of every send — API errors at send time, plus the
  `marketing_message_echoes`, `marketing_message_deliveries` and
  `marketing_message_delivery_failed` webhooks — and aggregate them per campaign.
- Public API covering the campaign lifecycle and audiences.

### Non-goals

- `marketing_message_reads` / `marketing_message_clicks` webhooks (decided: not now).
- Sending to subscribers who opt in **after** the token snapshot (see D5).
- Recurring / re-send of a campaign.
- A separate public endpoint for recipients or delivery estimate (decided: not
  in the API scope; stats are returned on `get`, see D20).
- Meta's undocumented bulk send by `custom_audience_id` (only seen in the error
  table; no request example).

### Anti-goals (would be a failure even if it "works")

- Sending to campaigns that existed before this ships without the user asking.
- A token receiving the same campaign twice.
- Silently burning Meta API calls all day after the daily budget is spent.
- Errors that are only in logs — the user must see them on the campaign.

## 2. Meta API facts this relies on

Sources (pulled 2026-10-17): send-messages, get-subscription-tokens,
api-reference (error table), generic/button/text/media, quick-replies,
postback, FAQ, changelog — all under
`https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/`.

| Purpose | Call |
|---|---|
| Send one message | `POST /act_<AD_ACCOUNT_ID>/messages` body `{ message_id: <campaignId>, messenger_delivery_data: { subscription_token }, message: {...} }` → `{ success: true, marketing_message_tracking_id: "<uuid>" }` |
| Tokens | `GET /<PAGE_ID>/notification_message_tokens` (Page token), `limit` ≤ 1000, cursor paging; `custom_audience_ids=<id>` for CA tokens |
| Delivery estimate | `GET /act_<AD_ACCOUNT_ID>/message_delivery_estimate?fields=estimate_delivery_lower_bound,estimate_delivery_upper_bound&daily_budget=<minor>&promoted_object={"page_id":<PAGE_ID>}&targeting_spec={"messenger_positions":["marketing_messages"],"publisher_platforms":["messenger"]}&is_direct_send_campaign=true&pacing_type=no_pacing` → `{ data: [{ estimate_delivery_lower_bound, estimate_delivery_upper_bound }] }` |

- `message_id` = our `FacebookMarketingMessage.campaignId` (Meta returns an ad id from `message_campaign`; it is what the send and webhooks call "message_id").
- Message shapes: `{text}`; `{attachment:{type:"template",payload:{template_type:"button"|"generic"|"media",...}}}`; `quick_replies` (≤13) alongside either. Buttons ≤3 (`web_url`, `postback`). Generic ≤10 elements, optional top-level `text` greeting. Media: `elements[{media_type, attachment_id|url, buttons}]`. Personalization macros `{{first_name}}`/`{{last_name}}`/`{{full_name}}` are resolved by Meta in titles/subtitles/greeting.
- Tokens from a CA upload return only `notification_messages_token`, `topic_title`, `notification_messages_reoptin`, `custom_audience_ids` — **no PSID**. Opt-in tokens also return `recipient_id` (PSID), `next_eligible_time`, `token_expiry_timestamp`. A CA's tokens are only returned once ≥100 users matched.
- `topic_title` has "no particular meaning" per Meta FAQ, and there is no server-side topic filter.
- One message per token per **12h** (error 2300035).
- Campaign readiness: FAQ says wait ≥60 minutes after creation (another answer says 10). Errors 2300012 / 2300041 = still populating.
- Daily budget is an average (Meta may overspend a day by up to 75%); budget exhaustion surfaces as **2300054** (daily) / **2300053** (lifetime).
- Webhooks (Page fields): `marketing_message_echoes` and `marketing_message_deliveries` carry `marketing_message_tracking_id`, `messenger_subscription_token`, `message_id` (campaign), `timestamp`, and — for opt-in subscribers only — `recipient_id` (PSID) and `mid`. `marketing_message_delivery_failed` carries `messenger_subscription_token`, `message_id`, `timestamp`, `error_message` (free text) — **no tracking id, no numeric code**.
- There is no opt-out webhook; an opt-out shows up as 2300034 on send.

### Delivery estimate — measured 2026-10-17

Called on a live ad set ("miracle mm campaign test Message Set", VND account)
via the earlier `GET /<AD_SET_ID>/message_delivery_estimate` form. The
implementation now calls the ad-account form (table above), which needs only
the ad account and Page — no ad set id:

| `daily_budget` (VND) | cost bounds | delivery bounds |
|---|---|---|
| 30,000 | 28,954 – 31,823 | 16 – 122 |
| 300,000 | 298,928 – 301,797 | 261 – 1,063 |
| 3,000,000 | 2,998,931 – 3,001,800 | 9,518 – 10,473 |
| 30,000,000 | 7,479,719 – 7,482,589 | 25,146 – 25,156 |
| 3,000,000,000 | same as above | same |

- It answers "how many messages does this budget buy". It saturates at the page's reachable subscriber pool (~25k here).
- Range is very wide at small budgets.
- `lifetime_budget` param on a daily ad set returned the daily figures (ignored). Untested on a lifetime campaign — not needed (D7).
- No audience parameter is passed, so for a CA campaign the ceiling is our own token count, not the estimate.

## 3. Decisions (made with the user)

| # | Decision |
|---|---|
| D1 | **Auto-start.** A campaign starts sending automatically once `createdAt + 1h` has passed. No Launch button. |
| D2 | **Pre-existing campaigns do not send.** Rows that exist when this ships get a "not sent" state and are only sent if the user/agent explicitly triggers a send (`send` action). Once triggered they follow the normal pipeline (the 1h wait is already satisfied). |
| D3 | **Opt-in target** = all of the Page's tokens, filtered client-side to `topic_title = "Updates and promotions"` (exact match). *My call:* if the Page has tokens but none match, the campaign fails with a reason that names the `topic_title` values it did see — so a localized title is visible, never silent. |
| D4 | **Custom-audience target** = tokens from `notification_message_tokens?custom_audience_ids=<audience.customAudienceId>`. |
| D5 | **Token snapshot.** Tokens are fetched **once**, when the campaign starts (the 1h mark). New subscribers are ignored. The campaign is **finished when every snapshotted token has a final outcome** (or the lifetime budget is exhausted). |
| D6 | **Daily budget pacing.** Each campaign-day: target = `min(estimate_delivery_upper_bound(dailyBudget), unsent tokens)`. Send up to the target; stop for the day immediately on **2300054**. Remaining tokens roll to the next day. Each token gets the message at most once. |
| D7 | **Lifetime budget** = one pass over all tokens. On **2300053** stop: remaining tokens are marked failed (budget exhausted) and the campaign finishes. |
| D8 | **Per-recipient timing errors** (2300035 cooldown, 2300042/43/44 frequency caps, 2300036, 2300052): **retry once** at the token's `next_eligible_time` if known, else +12h; a second failure marks the recipient failed. |
| D9 | **Campaign-level blockers** (payment/ToS/spend limit/campaign inactive/region/permission errors, grant error 190): the campaign moves to **paused** with the reason. The user or an agent fixes it and calls **resume**; unsent tokens continue. |
| D10 | **User controls:** **stop / resume**, **content locked** once the first message has been sent, **delete stops sending and deletes the Meta campaign** (`DELETE /<campaignId>`) before removing our row; if Meta's delete fails, our delete fails. |
| D11 | **Clicks:** buttons and quick replies use our existing Messenger postback payload format; a click/tap starts the flow/node for the contact via the existing Messenger handler. Verified (V1): a postback click on a marketing message carries `sender.id` (the PSID), so the existing handler resolves the contact as usual. |
| D12 | **Inbox:** when an echo webhook carries a PSID, the marketing message is added as an outgoing Message to that contact's Messenger conversation. |
| D13 | **Webhooks subscribed:** `marketing_message_echoes`, `marketing_message_deliveries`, `marketing_message_delivery_failed` only. |
| D14 | **Send token:** the existing Marketing Messages grant (`FacebookMarketingMessagesAuth`, the user token already used to create campaigns). Verified (V2): Meta accepts this token for `POST act_<id>/messages`. |
| D15 | **Pipeline mirrors broadcasts:** per-minute cron stages, a per-recipient table, rate-limited batches under a lease, a reconcile driver and a finalize step, `withBlockedOwnerGuard` on workspace-scoped jobs. |
| D16 | **Public API** covers the campaign lifecycle (list/get/create/update/delete/stop/resume/send + the pages/ad-accounts lookups create needs) and audiences (list/create/upload-more/delete/live status). |
| D17 | **Content rejected by Meta mid-campaign → the campaign fails.** Remaining recipients are marked failed with the content error; the content lock (D10) stays absolute. The user creates a new campaign. |
| D18 | **Meta campaign expiry.** Meta ends a lifetime campaign 30 days after creation (we never set `end_time`). `send` / `resume` are **refused** with a clear error for an expired campaign; if expiry hits while sending, the campaign **completes** with remaining recipients failed as "campaign ended". |
| D19 | **Stop / complete only affect our sending.** The Meta campaign is not paused (Meta charges per delivered message, so an idle campaign costs nothing). Only delete touches Meta (D10). |
| D20 | **Platform gates apply.** Each send counts toward the workspace's **bot-message quota**; reaching it pauses the campaign (reason "quota reached", resumable). Sending also **halts on trial expiry / read-only workspace** (pause, reason "trial expired"). Plus `withBlockedOwnerGuard` (D15). |

## 4. Design

### 4.1 Campaign status

New `status` column on `FacebookMarketingMessage`. Proposed values
(names are the builder's call; semantics are not):

| Status | Meaning |
|---|---|
| `notSent` | Pre-existing campaign (D2). Only the `send` action leaves this state. |
| `scheduled` | Created; waiting for `startsAt` (= `createdAt + 1h`, or now for a `send` on a `notSent` row whose campaign is already ≥1h old). |
| `sending` | Tokens snapshotted; recipients being handed off. |
| `waitingNextDay` | Daily campaign hit its day target or 2300054; resumes at the next campaign-day. |
| `paused` | Campaign-level blocker (D9). Stores `pausedReason` (error code + message). |
| `stopped` | User/agent stopped it. `resume` → `sending`. |
| `completed` | Every snapshotted token has a final outcome (or lifetime budget exhausted). |
| `failed` | 0 matching tokens, token fetch permanently failed, or Meta rejected the content (D17). |

Other new campaign columns (builder may refine): `startsAt`, `startedAt`,
`tokenCount`, `firstSentAt` (drives the content lock, D10), `pausedReason`,
`nextDayAt`, `completedAt`, a resume epoch like broadcasts' `resumeCount`.
The delivery estimate is keyed by ad account + Page, so no ad set id is needed
for it.

**Migration:** existing rows → `notSent`; new rows default `scheduled` with
`startsAt = createdAt + 1h`.

### 4.2 Recipient table

`FacebookMarketingMessageRecipient`, one row per (campaign, token). Recipients
are keyed by **token**, not by contact — CA tokens have no PSID.

Columns (builder may refine): `campaignId` (FK, cascade), `workspaceId`,
`subscriptionToken`, `psid` (nullable; from the token for opt-in, or from the
echo webhook), `status` (`pending` | `unconfirmed` | `sent` | `delivered` | `failed`),
`attempts`, `nextAttemptAt`, `trackingId` (from the send response),
`mid` (nullable), `sentAt`, `deliveredAt`, `failedAt`, `errorCode` (nullable
int), `errorMessage`, `errorSource` (`send` | `webhook`).

- Unique `(campaignId, subscriptionToken)` → idempotent snapshot inserts and
  the webhook correlation key.
- Index on `trackingId` for echo/delivery lookups.
- Partial index for "pending and due" ordering, as broadcasts do.
- Volume: a page pool can be tens of thousands of tokens per campaign. Whether
  to hash-partition like `ContactOnBroadcast` is the builder's call.
- Token values are opaque Meta identifiers; treat as sensitive-ish (never log
  them in full).

### 4.3 Pipeline (cron-driven, mirrors broadcasts)

1. **enqueue-due** (every minute): campaigns `scheduled` with `startsAt <= now`, or `waitingNextDay` with `nextDayAt <= now` → enqueue a prepare / day-start job with a deterministic job id.
2. **prepare** (once per campaign): fetch all tokens (paginate, `limit=1000`); filter by target (D3/D4); insert recipients `onConflictDoNothing`; set `tokenCount`; move to `sending` (or `failed` if 0 tokens). Token fetch rate-limit 2300080 → retry next tick.
3. **day start** (daily only): call the delivery estimate (`act_<id>/message_delivery_estimate` with the campaign's Page and daily budget); store today's target. Campaign-day boundary = the **ad account's timezone** (where Meta resets daily budget) — *my call*.
4. **dispatch** (every minute, lease per campaign like `claimDispatchWindow`): take a batch of due `pending` recipients (`nextAttemptAt IS NULL OR <= now`), bounded by the per-minute rate and — for daily — today's remaining target. For each: `POST act_<id>/messages`; on success store `trackingId`, `status=sent`, `sentAt`, set campaign `firstSentAt` if null. On error classify (§4.4).
5. **reconcile** (every minute): re-drive `sending` campaigns whose dispatch stalled.
6. **finalize** (every minute): a campaign with no `pending` recipients left (and no scheduled retries) → `completed`. Daily campaigns that reached today's target with work remaining → `waitingNextDay` with `nextDayAt` = next campaign-day start.

Sends happen in the worker against Meta (not the Messenger `/me/messages`
path). Rate per minute: *my call* — start with the broadcast default (500/min)
and back off on 2300078.

### 4.4 Error classification

Based on Meta's error table (wording-inferred; Meta labels none as retryable):

| Class | Codes | Effect |
|---|---|---|
| Budget, daily | 2300054 | Stop for the day → `waitingNextDay`. Recipient stays `pending` (not an attempt). |
| Budget, lifetime | 2300053, 2300015 | Remaining recipients failed with this code; campaign `completed`. |
| Still populating | 2300012, 2300041, 2300033 | Stop the batch; retry next tick. Not an attempt. |
| Transient / rate | 2300055, 2300057, 2300060–2300063, 2300068, 2300078, 2300081–2300083, 2300008 (a definite Meta error response) | Stop the batch; retry next tick. Not an attempt. |
| Ambiguous outcome | HTTP 5xx, timeouts, network errors after the request may have reached Meta | **Never re-sent** (anti-goal: no double send). Recipient → `unconfirmed`; the echo webhook (matched by `campaignId + token`) promotes it to `sent`, a `delivery_failed` webhook fails it. Still `unconfirmed` at finalize → counted as failed "outcome unknown". *My call.* |
| Recipient timing | 2300035, 2300036, 2300042–2300044, 2300052 | D8: retry once at `next_eligible_time` or +12h, then fail. |
| Recipient permanent | 2300004, 2300005, 2300032, 2300034, 2300037 | Recipient failed. |
| Campaign blocker | 2300000–2300003, 2300006, 2300007, 2300009, 2300011, 2300013, 2300014, 2300016, 2300017, 2300019, 2300020, 2300030, 2300031, 2300039, 2300040, 2300056, 2300058, 2300059, 2300065–2300067, 2300069, 2300070, 2300076, 2300091–2300093, Graph 190 | Campaign `paused` with reason (D9); 190 also marks the grant invalid (existing `markAuthInvalid`). |
| Content invalid | 2300010, 2300018, 2300021–2300027, 2300038, 2300046–2300048, 2300064, 2300071–2300075, 2300077, 2300090 | Campaign **`failed`**; remaining recipients failed with this code (D17). |
| Campaign ended on Meta | campaign-inactive codes (2300000, 2300002, 2300003) when Meta's end time has passed | Campaign **`completed`**; remaining recipients failed "campaign ended" (D18). Before end time these codes are blockers → `paused`. |
| Unknown code | — | Recipient failed with the raw code/message. |

Non-Meta pause reasons, all cleared by `resume` once the condition is gone:
**Page not connected** in this workspace (no Page token → cannot fetch tokens or
receive webhooks; also checked on every dispatch tick, so a mid-campaign
disconnect pauses) — *my call*; **quota reached** and **trial expired** (D20);
**grant invalid** (190).

### 4.5 Content → Meta payload

A pure converter from `mmContentSchema` (`apps/builder/src/features/facebook-marketing-messages/schema/content.ts`) to the Meta `message` object. Must live where the worker can import it (move/duplicate the schema into a package — builder's call).

- `text` → `{ text, quick_replies? }`
- `button` → `attachment.template { template_type: "button", text, buttons }`
- `media` → `attachment.template { template_type: "media", elements: [{ media_type, attachment_id (from saved `attachmentId`) or url, buttons }] }`
- `generic` → `attachment.template { template_type: "generic", text: greeting?, elements: [{ title, subtitle, image_url?, buttons }] }`
- Buttons: `openWebsite` → `{ type: "web_url", url, webview_height_ratio: compact|tall|full }` (40/70/100); `startExternalFlow` / `startExternalNode` → `{ type: "postback", title, payload }` using the **existing Messenger postback payload encoding** (`encodeButtonPayload`), so the existing postback/quick-reply handler starts the flow (D11). The payload carries **only flow/node** — no campaign id. Putting it in the `br` (broadcastId) slot would make `flow.ts` call `findSendableBroadcast`, get nothing, and silently skip the flow. *My call;* click attribution is a later feature.
- Quick replies: `text` → `{ content_type: "text", title, payload }`; `user_phone_number` / `user_email` → `{ content_type, payload? }`.
- Variables: our `{{...}}` contact variables cannot be resolved for a token with no contact. Only Meta's own macros (`{{first_name}}`, `{{last_name}}`, `{{full_name}}`) pass through. *My call:* pass content through unchanged; any non-Meta `{{variable}}` will surface as Meta error 2300038 and pause the campaign.

The payload is built **once per campaign** (it's identical for every token) and reused for each send.

### 4.6 Webhooks

- Add `marketing_message_echoes`, `marketing_message_deliveries`, `marketing_message_delivery_failed` to the Page subscription (`integrations/messenger/src/apis/page.ts` `PAGE_SUBSCRIBE_SCOPES`) and to the app's webhook config. Already-connected pages need re-subscribing — mirror `apps/worker/scripts/resubscribe-messenger-webhook-fields.ts`.
- Dispatch them in `integrations/messenger/src/handlers/webhook.ts` (`changes[]` by `field`) to a worker job.
- **echoes** → find recipient by `trackingId` (fallback: `campaignId + token`); ensure `status ≥ sent`, store `psid`, `mid`. If a PSID is present and we have that contact's Messenger ContactInbox, create the outgoing Message in their conversation (D12). If no contact exists for the PSID, **skip** the inbox message — we do not create contacts from echoes (contact quota, audience counts). *My call.* No dedup needed against the regular echo handler: `message_echoes` does not fire for marketing messages (V4).
- **deliveries** → recipient `delivered`, `deliveredAt`.
- **delivery_failed** → find recipient by `(campaignId = message_id, token)`; `failed`, `errorSource=webhook`, `errorMessage=error_message`, `errorCode=null`. A late failure after `delivered` is still recorded as failed (*my call*).
- Webhooks for unknown campaigns/tokens are ignored (logged at debug).
- Envelope (V3, real captures): `{object:"page", entry:[{id, time, messaging:[{field, message_id, messenger_subscription_token, timestamp, ...}]}]}` — a `messaging[]` item with a `field` and no `sender`; the item itself is the value. `message_id` may be a bare JSON number above 2^53 (quoted before `JSON.parse`); `timestamp` is ms on echoes and seconds on delivery_failed.

### 4.7 Stats & error breakdown

Per campaign:
- Counts: `tokenCount`, `sent`, `delivered`, `failed`, `pending`.
- Error breakdown: grouped by `errorCode` (send errors) and by `errorMessage` text (webhook failures, which have no code), with counts. Human-readable labels for known codes (i18n).
- Computed from the recipient table (count FILTER), like broadcast stats.

### 4.8 UI

- Campaigns table: add **status** and **sent / delivered / failed** columns.
- The `[id]` route (today edit-only) gains a **detail view**: status, paused reason, counts, error breakdown, controls (stop / resume / send for `notSent`). Editing content is disabled once `firstSentAt` is set.
- Delete confirms that the Meta campaign will be deleted too.
- All strings via `useTranslations()`.
- Refresh while a campaign is `scheduled`/`sending` (polling, as the broadcasts table does). Invalidate on every mutation.

### 4.9 Public API

New `features/facebook-marketing-messages/api/public.ts` behind
`workspaceTokenAuthAPIForScope("<scope>")`, nested in `routers/public.ts`.
Every procedure calls the same service method as the UI.

- `pages.list`, `adAccounts.list` (inputs for create)
- `campaigns.list`, `campaigns.get` (**includes status, counts and error breakdown** — invariant 23 requires the stats the UI shows to be reachable), `campaigns.create`, `campaigns.update`, `campaigns.delete`, `campaigns.stop`, `campaigns.resume`, `campaigns.send` (for `notSent`)
- `audiences.list`, `audiences.create`, `audiences.uploadMore`, `audiences.delete`, `audiences.liveStatus`
- Summaries say which call supplies each input id. Then run the `cli-mcp-docs` skill.
- The OAuth grant connect stays UI-only (exempt: browser redirect step). If no valid grant exists, procedures return a clear error telling the agent a human must connect.
- Audience **create** takes a file today (server action parsing CSV/XLSX). For the API: *builder decides* between accepting the file (multipart) or pre-normalized rows as JSON.

## 5. Verification items (must check against real Meta before/while building)

- **V1 — resolved (user, 2026-10-18):** postback clicks carry `sender.id` (PSID).
- **V2 — resolved (user, 2026-10-18):** the Marketing Messages grant token is accepted for sending.
- **V3 — resolved (user, 2026-10-21):** real envelopes of all three captured — echoes, deliveries and delivery_failed all arrive as `entry[].messaging[]` items; see §4.6 Envelope. No `changes[]` path.
- **V4 — resolved (user, 2026-10-18):** `message_echoes` does not fire for marketing messages.
- **V5 — resolved (user, 2026-10-18):** the 1h wait is long enough.

## 6. Calls made by the spec author (not the user)

Check these while reading:

1. Ambiguous send outcomes (timeout/5xx) are never retried; `unconfirmed` until a webhook resolves them (§4.4).
2. A disconnected Page pauses the campaign; resume once reconnected (§4.4).
3. Postback payloads carry flow/node only, no campaign id (§4.5).
4. Opt-in filter is an exact `topic_title` match; zero matches fails loudly with the titles seen (D3).
5. Echo with a PSID but no existing contact → no inbox message, no contact created (§4.6).
6. Campaign-day boundary = ad account timezone (§4.3).
7. Non-Meta `{{variables}}` pass through and fail via Meta 2300038 → campaign fails (§4.5, D17).
8. A `delivery_failed` webhook after `delivered` still marks the recipient failed (§4.6).
9. Dispatch rate starts at 500/min, backs off on 2300078 (§4.3).

## 7. Left to the builder

- Exact status names, column names, indexes, partitioning of the recipient table.
- Where the content converter and schema live so the worker can use them.
- Queue/job names, batch sizes, concurrency, lease TTL.
- i18n labels for error codes.
- Public API scope name and route shapes.
