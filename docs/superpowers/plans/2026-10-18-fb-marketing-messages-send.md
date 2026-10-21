# FB Marketing Messages — Send Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Marketing Messages campaigns actually deliver to subscription tokens through Meta's direct-send API, track per-token outcomes (send response + three webhooks), aggregate them per campaign, and expose the whole feature in the public API.

**Architecture:** Meta calls live in `integrations/facebook-ads`. A new `facebookMarketingMessageDeliveryService` in `packages/business` owns the campaign state machine, token snapshot, dispatch, error classification and webhook application. It uses a new `FacebookMarketingMessageRecipient` table plus status columns on `FacebookMarketingMessage`. Per-minute schedule crons in `apps/worker` drive it the way the broadcast pipeline does. The Messenger webhook routes `marketing_message_*` changes to an integration job. The builder gets a shared `lib/campaign-operations.ts` used by both the server actions and a new public router.

**Tech Stack:** TypeScript, Drizzle (PostgreSQL), BullMQ (`scheduleQueue`, `integrationQueue`), Redis (`casStore`, `distributedLock`), ky Graph client, date-fns-tz, oRPC, next-intl, vitest + msw.

**Spec:** `docs/superpowers/specs/2026-10-17-fb-marketing-messages-send-design.md` (decisions D1–D20, §4, §6). Read it before any task.

## Global Constraints

- Auto-start at `startsAt = createdAt + 1h`. Rows that exist before the migration get status `notSent` and send only via `send` (D1, D2).
- Opt-in filter: `topic_title === "Updates and promotions"`, exact match (D3). CA tokens come from `custom_audience_ids=<audience.customAudienceId>` (D4).
- Tokens are fetched once per campaign (`limit=1000`, cursor paging). Each token gets the message at most once: unique `(campaignId, subscriptionToken)` (D5).
- Daily day target = `min(estimate_delivery_upper_bound, unsent)`. 2300054 → `waitingNextDay`. The day boundary is midnight in the ad account's `timezone_name` (D6, §4.3).
- Lifetime budget: one pass. 2300053/2300015 → remaining recipients failed, campaign `completed` (D7).
- Recipient-timing codes retry once at the token's `next_eligible_time`, else `+12h` (D8).
- Ambiguous outcomes (timeout, network, HTTP 5xx) are never re-sent; the recipient goes to `unconfirmed` (§4.4).
- Dispatch rate 500 sends/min per campaign. On 2300078, stop the batch until the next tick (§4.3).
- Content is locked once `firstSentAt` is set. Delete calls `DELETE /<campaignId>` on Meta first and aborts if Meta fails (D10). Stop/complete never touch Meta (D19).
- Content rejected by Meta → campaign `failed` (D17). Meta end time passed → `send`/`resume` refused, mid-send → `completed` (D18).
- Each successful send increments `botMessages` + `monthlyBotMessages` + workspace usage. Quota reached → `paused/quotaReached`. Blocked owner (trial expiry) → `paused/workspaceBlocked` (D20).
- Postback payloads: `encodeButtonPayload({ flowId, buttonId })` only, never `broadcastId` (§4.5).
- Graph API version: `DEFAULT_API_VERSION` from `integrations/facebook-ads/src/constants.ts`.
- Never log full subscription tokens; log the last 6 chars at most. Logger key is `err` (invariant 20).
- Chain: action/handler → service → repository; no `db` in apps (invariant 9). No dynamic `import()` outside `apps/builder` (rule).
- **Never run `db:migrate`.** Generate, show the SQL, stop for approval.
- i18n keys go in all 21 locale JSON files under `apps/builder/messages/`; mutations invalidate TanStack caches (invariants 7, 21).
- Stage specific files only. Commit format `type(scope): subject`, scope `fb-marketing-messages`.

## Review Focus

1. **A Page with 0 matching opt-in tokens but some tokens with another `topic_title` (e.g. a localized title).** The campaign must go `failed`, and the reason must name the titles seen. It must not hang in `sending` or "complete" silently. Test in Task 5.
2. **A send times out after Meta accepted it, then the echo webhook arrives.** The recipient goes `unconfirmed` → `sent`, is never re-sent, and is counted once. Test in Tasks 6 and 8.
3. **Daily campaign whose estimate upper bound exceeds the token count, plus a 2300054 halfway through the batch.** The rest of the batch is not sent and stays `pending`. `waitingNextDay` is set with `nextDayAt` = next local midnight, and the 2300054 does not count as an attempt. Test in Task 6.
4. **Webhook for a campaign or token we don't know (another app's campaign on the same Page).** It is ignored with no throw, so the webhook job doesn't retry forever. Test in Task 8.
5. **Resume on an expired lifetime campaign, or one with no valid grant.** It is refused with a clear error code, and the status is unchanged. Test in Task 5.

---

## File Structure

**packages/database**
- Create `src/partials/facebook-marketing-message-content.ts`. `mmContentSchema` and friends move here from the builder so the worker can parse content.
- Modify `src/partials/facebook-marketing-messages.ts`: campaign/recipient status and reason enums.
- Modify `src/schema/facebook-marketing-message.ts`: delivery columns.
- Create `src/schema/facebook-marketing-message-recipient.ts`, `src/relations/facebook-marketing-message-recipient.ts`.
- Modify `src/schema/index.ts`, `src/relations/index.ts` (import + spread, invariant 2), `src/types.ts`.
- Create `src/repositories/facebook-marketing-messages/recipient-repository.ts`; extend `repository.ts`; export from the folder's `index.ts`.
- Generated `drizzle/<ts>_fb_marketing_message_delivery/`.

**integrations/facebook-ads**
- Create `src/apis/marketing-messages-send.ts`: tokens list, send, delivery estimate, campaign delete, ad set schedule.
- Create `src/marketing-messages/error-classes.ts`: error-code classification.
- Modify `src/index.ts`.

**packages/business**
- Create `src/facebook-marketing-message-delivery/`, containing `content-payload.ts`, `page-token.ts`, `usage.ts`, `service.ts`, `webhook.ts`, `stats.ts`, `errors.ts`, `index.ts`. Barrel-export from `src/index.ts` (no Node built-ins).

**packages/worker-config**
- Modify `src/queues/schedule/index.ts`: three job types + job ids.
- Modify `src/queues/integration/index.ts`: `processMarketingMessageWebhook`.

**apps/worker**
- Create `src/schedule/handlers/enqueue-marketing-messages.ts`, `dispatch-marketing-messages.ts`, `finalize-marketing-messages.ts`, `process-marketing-message-campaign.ts`.
- Modify `src/schedule/handlers/register-schedules.ts` and `src/schedule/worker.ts`.
- Create `src/integration/handlers/marketing-message-webhook.ts`; modify `src/integration/worker.ts`.
- Modify `src/integration/handlers/received-message.ts`: export `saveAndBroadcastMessage`.
- Modify `scripts/resubscribe-messenger-webhook-fields.ts`.

**integrations/messenger**
- Modify `src/apis/page.ts` (`PAGE_SUBSCRIBE_SCOPES`) and `src/handlers/webhook.ts`.

**apps/builder** (`src/features/facebook-marketing-messages/…`)
- Modify `schema/content.ts` to re-export from the database partial.
- Create `lib/campaign-operations.ts`. Move `createMarketingMessage` / `updateMarketingMessage` here and add `deleteMarketingMessage`, `stopMarketingMessage`, `resumeMarketingMessage`, `sendMarketingMessage`.
- Modify `actions/create.action.ts`, `update.action.ts`, `delete.action.ts`. Create `actions/campaign-control.action.ts`.
- Create `api/public.ts`; modify `src/routers/public.ts`.
- Modify `components/marketing-messages-table.tsx`. Create `components/campaign-detail.tsx`, `components/campaign-status-badge.tsx`, `lib/error-labels.ts`.
- Modify `src/app/space/[workspaceId]/fb-marketing-messages/[id]/page.tsx`.
- `messages/*.json` (21 locales).

---

### Task 1: Move the content schema into a shared partial

The worker must parse `FacebookMarketingMessage.content`. The schema lives in the builder today, and the database package already depends on `flow-config` + `utils`.

**Files:**
- Create: `packages/database/src/partials/facebook-marketing-message-content.ts`
- Modify: `packages/database/src/partials/index.ts`
- Modify: `apps/builder/src/features/facebook-marketing-messages/schema/content.ts`
- Test: existing `apps/builder/__tests__/marketing-messages-*.test.ts` (unchanged behavior)

**Interfaces:**
- Produces, from `@chatbotx.io/database/partials`, unchanged names: `mmContentSchema`, `MmContent`, `MmButton`, `MmQuickReply`, `MmGenericElement`, `MmMediaRef`, `MmPostbackAction`, `MM_*` constants. Default factories (`mm*DefaultFn`) stay in the builder.

- [ ] **Step 1:** Move everything above `// ── Defaults` from `apps/builder/.../schema/content.ts` into the new partial. `uploadModes` comes from `./shared`, `BUTTON_LABEL_MAX` from `@chatbotx.io/flow-config`. Export the partial from `partials/index.ts`.
- [ ] **Step 2:** Replace the moved block in the builder file with `export * from "@chatbotx.io/database/partials"`-scoped named re-exports, keeping the defaults.
- [ ] **Step 3:** Run `pnpm --filter builder test -- marketing-messages` and `pnpm --filter @chatbotx.io/database check-types`. Expected: all pass, no type errors.
- [ ] **Step 4:** Commit `refactor(fb-marketing-messages): move content schema to database partials`.

---

### Task 2: Delivery schema, migration, repositories

**Files:**
- Modify: `packages/database/src/partials/facebook-marketing-messages.ts`
- Modify: `packages/database/src/schema/facebook-marketing-message.ts`
- Create: `packages/database/src/schema/facebook-marketing-message-recipient.ts`, `src/relations/facebook-marketing-message-recipient.ts`
- Modify: `src/schema/index.ts`, `src/relations/index.ts`, `src/types.ts`
- Create: `src/repositories/facebook-marketing-messages/recipient-repository.ts`; modify `repository.ts` and the folder's `index.ts`
- Test: `packages/database/__tests__/facebook-marketing-message-recipient-schema.test.ts`

**Interfaces:**
- Produces (partials):
  ```ts
  export const facebookMarketingMessageStatuses = ["notSent","scheduled","sending","waitingNextDay","paused","stopped","completed","failed"] as const
  export const facebookMarketingMessageStatusReasons = ["pageNotConnected","quotaReached","workspaceBlocked","grantInvalid","metaBlocker","contentRejected","noTokens","noMatchingTopic","tokenFetchFailed","campaignEnded","lifetimeBudgetReached"] as const
  export const facebookMarketingMessageRecipientStatuses = ["pending","unconfirmed","sent","delivered","failed"] as const
  export const MM_OPT_IN_TOPIC_TITLE = "Updates and promotions"
  export const MM_START_DELAY_MS = 60 * 60 * 1000
  export const MM_RETRY_DELAY_MS = 12 * 60 * 60 * 1000
  export const MM_SENDS_PER_MINUTE = 500
  export const MM_UNCONFIRMED_GRACE_MS = 60 * 60 * 1000   // finalize treats unconfirmed older than this as failed "outcomeUnknown"
  ```
  Plus the derived `FacebookMarketingMessageStatus`, `…StatusReason` and `…RecipientStatus` types.
- New `FacebookMarketingMessage` columns (all nullable unless noted):
  - `status` text not null, default `"scheduled"`.
  - `startsAt`, `startedAt`, `firstSentAt`, `completedAt`, `nextDayAt`, `metaEndsAt`: timestamps.
  - `statusReason` (text, the reason type), `statusErrorCode` int, `statusErrorMessage` text.
  - `timezoneName` text, `adSetId` text.
  - `tokenCount` int, `dayTarget` int, `daySent` int not null default 0.
  - `resumeCount` int not null default 0.
  - Index `FacebookMarketingMessage_status_startsAt_idx` on `(status, startsAt)`.
- `FacebookMarketingMessageRecipient` table:
  - Columns: `...sharedColumns`, `workspaceId` (FK cascade), `campaignRowId` (FK → `FacebookMarketingMessage.id`, cascade), `subscriptionToken` text not null, `psid` text, `mid` text, `trackingId` text, `status` text not null (the recipient status type), `attempts` int not null, `nextAttemptAt`, `nextEligibleAt`, `sentAt`, `deliveredAt`, `failedAt`, `errorCode` int, `errorMessage` text, `errorSource` text (`"send" | "webhook"`).
  - Unique `FacebookMarketingMessageRecipient_campaign_token_key` on `(campaignRowId, subscriptionToken)`.
  - Index on `trackingId`.
  - Partial index `…_due_idx` on `(campaignRowId, nextAttemptAt, id) WHERE status = 'pending'`.
  - No partitioning (*plan call*: the volume is tens of thousands per campaign).
- `facebookMarketingMessageRecipientRepository` (every method takes `tx: DatabaseClient = db` last):
  - `insertMany(rows: NewRecipient[]): Promise<number>`: `onConflictDoNothing`, returns the inserted count.
  - `listDue({ campaignRowId, now, limit }): Promise<RecipientModel[]>`: `status='pending' AND (nextAttemptAt IS NULL OR nextAttemptAt <= now)`, ordered by id.
  - `update({ id, ...patch }): Promise<void>`
  - `failRemaining({ campaignRowId, errorCode, errorMessage, now }): Promise<number>`: every `pending`/`unconfirmed` row becomes `failed`.
  - `findByTrackingId(trackingId)` and `findByCampaignToken({ campaignRowId, subscriptionToken })`
  - `countOutcomes(campaignRowId): Promise<{ total; pending; unconfirmed; sent; delivered; failed; pendingDue: number; oldestUnconfirmedAt: Date | null }>`. `pendingDue` counts `pending` rows with no future `nextAttemptAt`.
  - `errorBreakdown(campaignRowId): Promise<{ errorCode: number | null; errorMessage: string; count: number }[]>`: group by code when non-null, else by message. Sorted by count desc, at most 50 rows.
- `facebookMarketingMessageRepository` additions:
  - `listDueToStart(now)`: status `scheduled` with `startsAt <= now`, or `waitingNextDay` with `nextDayAt <= now`.
  - `listByStatus(status)`
  - `findByCampaignId(campaignId)`, unscoped, for webhooks.
  - `transition({ id, from: Status[], patch }): Promise<Model | null>`: conditional `UPDATE … WHERE status IN from`; returns null when it loses the race.
  - `incrementDaySent({ id, by })`
  - `setFirstSentAt(id)`: only when null.

- [ ] **Step 1: Write the failing test.** Using the `getTableConfig` pattern from `__tests__/facebook-marketing-messages-schema.test.ts`:
  ```ts
  test("recipient table is unique per campaign+token", () => {
    const c = getTableConfig(facebookMarketingMessageRecipientModel)
    expect(c.name).toBe("FacebookMarketingMessageRecipient")
    expect(c.indexes.find(i => i.config.name === "FacebookMarketingMessageRecipient_campaign_token_key")?.config.unique).toBe(true)
  })
  test("campaign has delivery columns", () => {
    const names = getTableConfig(facebookMarketingMessageModel).columns.map(c => c.name)
    expect(names).toEqual(expect.arrayContaining(["status","startsAt","firstSentAt","statusReason","tokenCount","dayTarget","daySent","metaEndsAt","timezoneName","resumeCount"]))
  })
  ```
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/database test -- facebook-marketing-message-recipient`. Expected: FAIL (model not exported).
- [ ] **Step 3:** Implement the partials, schema, relations (both edits in `relations/index.ts`), types and repositories.
- [ ] **Step 4:** Run `pnpm --filter @chatbotx.io/database make:migration fb_marketing_message_delivery`, then hand-edit `migration.sql`:
  - Trim any re-emitted tables (see memory note on snapshot drift).
  - Make the backfill explicit: `ADD COLUMN "status" text DEFAULT 'notSent' NOT NULL;` followed by `ALTER TABLE "FacebookMarketingMessage" ALTER COLUMN "status" SET DEFAULT 'scheduled';`. Existing rows become `notSent` (D2).
- [ ] **Step 5:** Run `pnpm --filter @chatbotx.io/database test -- facebook-marketing-message` and `pnpm --filter @chatbotx.io/database lint` (drift check). Expected: PASS. **Show the migration SQL to the user and stop for approval before any `db:migrate`.**
- [ ] **Step 6:** Commit `feat(database): add marketing message delivery columns and recipient table`.

---

### Task 3: Meta send-side Graph calls and error classes

**Files:**
- Create: `integrations/facebook-ads/src/apis/marketing-messages-send.ts`
- Create: `integrations/facebook-ads/src/marketing-messages/error-classes.ts`
- Modify: `integrations/facebook-ads/src/index.ts` (export both)
- Test: `integrations/facebook-ads/__tests__/marketing-messages-send.test.ts`, `__tests__/marketing-messages-error-classes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NotificationMessageToken = { token: string; topicTitle: string | null; psid: string | null; nextEligibleAt: Date | null; customAudienceIds: string[] }
  export function listNotificationMessageTokens(input: { pageAccessToken: string; pageId: string; customAudienceId?: string; version?: string }): Promise<NotificationMessageToken[]>
  export type SendMarketingMessageResult =
    | { ok: true; trackingId: string }
    | { ok: false; kind: "meta"; code: number | null; subcode: number | null; message: string }
    | { ok: false; kind: "uncertain"; message: string }
  export function sendMarketingMessage(input: { accessToken: string; adAccountId: string; campaignId: string; subscriptionToken: string; message: Record<string, unknown>; version?: string }): Promise<SendMarketingMessageResult>
  export function getMessageDeliveryEstimate(input: { accessToken: string; adSetId: string; dailyBudgetMinorUnits: number; version?: string }): Promise<{ deliveryLower: number; deliveryUpper: number }>
  export function getMessageCampaignSchedule(input: { accessToken: string; campaignId: string; version?: string }): Promise<{ adSetId: string; endTime: Date | null }>
  export function deleteMessageCampaign(input: { accessToken: string; campaignId: string; version?: string }): Promise<void>
  // error-classes.ts
  export type MarketingMessageErrorClass = "dailyBudget" | "lifetimeBudget" | "notReady" | "transient" | "recipientTiming" | "recipientPermanent" | "campaignBlocker" | "campaignInactive" | "contentInvalid" | "unknown"
  export function classifyMarketingMessageError(code: number | null): MarketingMessageErrorClass
  ```
- Field mapping in `listNotificationMessageTokens`:
  - `notification_messages_token` → `token`, `topic_title` → `topicTitle`, `recipient_id` → `psid`.
  - `next_eligible_time` (unix seconds) → `nextEligibleAt`.
  - `custom_audience_ids` → `customAudienceIds`.
  - Page with `limit=1000` and follow `paging.next` until it is absent; wrap in `rescue`.
- `sendMarketingMessage` POSTs `act_<id>/messages` with JSON `{ access_token, message_id: campaignId, messenger_delivery_data: { subscription_token }, message }`. It does NOT use `rescue`: catch ky errors itself and map them (the POST is never retried, per the http-client config).
  - `HTTPError` with status < 500 → `kind: "meta"`, with `code`/`error_subcode`/`message` from the body.
  - Status ≥ 500, `TimeoutError`, or a network error → `kind: "uncertain"`.
  - Run the message through `redactTokens`.
- `getMessageDeliveryEstimate`: `GET /<adSetId>/message_delivery_estimate?fields=estimate_delivery_lower_bound,estimate_delivery_upper_bound&daily_budget=<n>` → `data[0]`.
- `getMessageCampaignSchedule`: `GET /<campaignId>?fields=adset{id,end_time}`. Use `searchParams`; the curly braces are literal.
- Code sets for `classifyMarketingMessageError` (copy exactly from spec §4.4):
  - dailyBudget: `2300054`
  - lifetimeBudget: `2300053, 2300015`
  - notReady: `2300012, 2300041, 2300033`
  - transient: `2300055, 2300057, 2300060, 2300061, 2300062, 2300063, 2300068, 2300078, 2300081, 2300082, 2300083, 2300008`
  - recipientTiming: `2300035, 2300036, 2300042, 2300043, 2300044, 2300052`
  - recipientPermanent: `2300004, 2300005, 2300032, 2300034, 2300037`
  - campaignInactive: `2300000, 2300002, 2300003`
  - campaignBlocker: `2300001, 2300006, 2300007, 2300009, 2300011, 2300013, 2300014, 2300016, 2300017, 2300019, 2300020, 2300030, 2300031, 2300039, 2300040, 2300056, 2300058, 2300059, 2300065, 2300066, 2300067, 2300069, 2300070, 2300076, 2300091, 2300092, 2300093, 190`
  - contentInvalid: `2300010, 2300018, 2300021`–`2300027`, `2300038, 2300046, 2300047, 2300048, 2300064, 2300071`–`2300075`, `2300077, 2300090`
  - `null` or any other code → `unknown`

- [ ] **Step 1: Write the failing tests** (msw pattern from `__tests__/message-campaigns.test.ts`):
  - `listNotificationMessageTokens follows paging.next and maps fields`: two pages, the second has no `next`. Expect 3 tokens, with `nextEligibleAt` equal to `new Date(1760000000 * 1000)`.
  - `listNotificationMessageTokens passes custom_audience_ids when given`.
  - `sendMarketingMessage returns trackingId on success`: body `{ success: true, marketing_message_tracking_id: "t-1" }`. Assert that the posted body has `message_id: "C1"` and `messenger_delivery_data.subscription_token: "TOK"`.
  - `sendMarketingMessage maps a Graph 400 to kind meta with code 2300054`.
  - `sendMarketingMessage maps HTTP 503 to kind uncertain`.
  - `sendMarketingMessage maps a network error to kind uncertain`: use `HttpResponse.error()`.
  - `getMessageDeliveryEstimate returns upper/lower`: fixture `{ data: [{ estimate_delivery_lower_bound: 16, estimate_delivery_upper_bound: 122 }] }`.
  - `classifyMarketingMessageError`: table-driven over one code per class, plus `190 → campaignBlocker`, `null → unknown` and `999 → unknown`.
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/integration-facebook-ads test -- marketing-messages-send marketing-messages-error`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(facebook-ads): marketing message send, tokens, estimate and error classes`.

---

### Task 4: Content → Meta message payload

**Files:**
- Create: `packages/business/src/facebook-marketing-message-delivery/content-payload.ts`
- Test: `packages/business/__tests__/facebook-marketing-message-content-payload.test.ts`

**Interfaces:**
- Consumes: `MmContent` (Task 1), `encodeButtonPayload` from `@chatbotx.io/flow-config`.
- Produces: `export function buildMarketingMessagePayload(content: MmContent): Record<string, unknown>`, plus `export function summarizeMarketingMessage(content: MmContent): string`. The second returns the text, greeting or first element title, and is used for the inbox message.

Mapping (spec §4.5):
- `browserSize` 40/70/100 → `webview_height_ratio` `compact`/`tall`/`full`.
- Media buttons and generic buttons use the same button mapper.
- Postback payload: `encodeButtonPayload({ flowId, buttonId: button.id })` for `startExternalFlow`. For `startExternalNode`, use whatever the existing Messenger converter encodes for node starts (read `send-button.ts` / `convertQuickReplies` and mirror it). Never pass `broadcastId`.
- Quick replies: `user_phone_number`/`user_email` include `payload` only when an action exists.
- Generic element `image.url === ""` → omit `image_url`.
- Media: prefer `attachment_id` when `media.attachmentId` is set, else `url`.

- [ ] **Step 1: Write the failing tests.** One per template type. Assertions:
  ```ts
  expect(buildMarketingMessagePayload({ templateType: "text", text: "Hi", quickReplies: [] })).toEqual({ text: "Hi" })
  // button: payload.template_type "button", buttons[0] { type: "web_url", url, webview_height_ratio: "full" }
  // postback button: { type: "postback", title, payload: encodeButtonPayload({ flowId: "11", buttonId: "22" }) }
  // media with attachmentId "A1": elements[0] { media_type: "image", attachment_id: "A1" } and no url key
  // generic: payload.text === greeting; element with image url "" has no image_url key
  // quick reply user_email without action: { content_type: "user_email" } (no payload key)
  ```
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/business test -- content-payload`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(fb-marketing-messages): convert campaign content to Meta payload`.

---

### Task 5: Delivery service — lifecycle and preparation

**Files:**
- Create: `packages/business/src/facebook-marketing-message-delivery/{errors.ts,page-token.ts,service.ts,index.ts}`
- Modify: `packages/business/src/index.ts` (`export * from "./facebook-marketing-message-delivery"`)
- Modify: `packages/business/src/facebook-marketing-messages/service.ts`: `create` writes `status: "scheduled"` and `startsAt: createdAt + MM_START_DELAY_MS` explicitly.
- Test: `packages/business/__tests__/facebook-marketing-message-delivery-lifecycle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // errors.ts — thrown as ChatbotXException-compatible errors with these codes
  export const mmDeliveryErrorCodes = ["mmNotFound","mmInvalidState","mmCampaignEnded","mmGrantInvalid","mmPageNotConnected"] as const
  // page-token.ts
  export async function resolveMarketingMessagePageToken(input: { workspaceId: string; pageId: string }): Promise<{ accessToken: string; version?: string } | null>
  // service.ts
  export const facebookMarketingMessageDeliveryService: {
    resolveGrantToken(workspaceId: string): Promise<{ accessToken: string } | null>   // findAuth + decryptAuth, status must be "active"
    prepare(campaignRowId: string): Promise<void>
    startDay(campaignRowId: string): Promise<void>
    stop(input: { workspaceId: string; id: string }): Promise<FacebookMarketingMessageModel>
    resume(input: { workspaceId: string; id: string }): Promise<FacebookMarketingMessageModel>
    send(input: { workspaceId: string; id: string }): Promise<FacebookMarketingMessageModel>
    pause(input: { id: string; reason: FacebookMarketingMessageStatusReason; errorCode?: number | null; errorMessage?: string | null }): Promise<void>
    // dispatchBatch, finalize: Task 6; applyWebhook, getStats: Task 7
  }
  ```
- `resolveMarketingMessagePageToken` mirrors the builder's `createAudiencePageTokenResolver`: `integrationMessengerService.findByPageId` → `auth.tokens.accessToken`, `auth.metadata.version`.
- `prepare(id)`, runnable when status is `scheduled` and `startsAt <= now`:
  1. The grant must be valid, else `pause(grantInvalid)`. The page token must exist, else `pause(pageNotConnected)`.
  2. `getMessageCampaignSchedule` → store `adSetId` and `metaEndsAt`. `getAdAccountDetails(accessToken, adAccountId)` → `timezoneName`.
  3. Fetch tokens with `listNotificationMessageTokens`. For `optIn`, keep `topicTitle === MM_OPT_IN_TOPIC_TITLE`. For `customAudience`, pass the audience's `customAudienceId`.
  4. Zero tokens fetched → `failed/noTokens`. Tokens fetched but none matched → `failed/noMatchingTopic`, with `statusErrorMessage` set to the distinct titles seen, joined with ", ".
  5. A Graph error while fetching: 2300080 or transient → leave it `scheduled` (the next tick retries); anything else → `failed/tokenFetchFailed`.
  6. `insertMany`, then `transition(scheduled → sending)` with `tokenCount` and `startedAt`. A daily campaign then calls `startDay`.
- `startDay(id)`, daily only: `getMessageDeliveryEstimate(dailyBudget = budgetMinorUnits)`, then `dayTarget = min(deliveryUpper, pending count)`, `daySent = 0`, status → `sending`.
- `send` only works from `notSent`. It refuses `mmCampaignEnded` when `metaEndsAt` is known and in the past (fetch the schedule first). Otherwise it sets `scheduled` with `startsAt = now` (the campaign is already ≥ 1h old).
- `resume` only works from `paused`/`stopped`:
  - Refuses `mmCampaignEnded` when `metaEndsAt <= now`, and `mmGrantInvalid` when there is no grant token.
  - If `tokenCount` is null (paused before the snapshot) → `scheduled`.
  - Otherwise, a daily campaign whose `nextDayAt` is set and still in the future → `waitingNextDay`.
  - Otherwise → `sending`. This keeps today's `dayTarget`/`daySent`, so a same-day resume can't overspend the day.
  - Increments `resumeCount` and clears the status reason fields.
- `stop` works from `scheduled|sending|waitingNextDay|paused` → `stopped`. Any other state → `mmInvalidState`.

- [ ] **Step 1: Write the failing tests.** Mock repositories, `@chatbotx.io/integration-facebook-ads`, `integrationMessengerService` and the audit dispatcher (the pattern from `__tests__/facebook-marketing-messages-service.test.ts`):
  - `prepare filters opt-in tokens to "Updates and promotions" and inserts them`
  - `prepare uses the audience customAudienceId for customAudience targets`
  - `prepare fails with noMatchingTopic and lists seen titles`: tokens with `topicTitle` "Cập nhật"/"Khác" → `statusErrorMessage` `"Cập nhật, Khác"`. **(Review Focus 1)**
  - `prepare fails with noTokens when Meta returns none`
  - `prepare pauses pageNotConnected when no page token`
  - `prepare leaves the campaign scheduled on token rate limit 2300080`
  - `prepare on a daily campaign sets dayTarget to min(upper bound, tokens)`: upper bound 122, 50 tokens → 50.
  - `resume refuses an expired campaign with mmCampaignEnded and leaves status unchanged` **(Review Focus 5)**
  - `resume refuses with mmGrantInvalid when no grant` **(Review Focus 5)**
  - `send refuses unless status is notSent`
  - `stop from completed throws mmInvalidState`
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/business test -- delivery-lifecycle`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(fb-marketing-messages): delivery lifecycle and token snapshot`.

---

### Task 6: Delivery service — dispatch and finalize

**Files:**
- Create: `packages/business/src/facebook-marketing-message-delivery/usage.ts`
- Modify: `packages/business/src/facebook-marketing-message-delivery/service.ts`
- Test: `packages/business/__tests__/facebook-marketing-message-delivery-dispatch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function recordMarketingMessageUsage(input: { workspaceId: string; count: number }): Promise<void>
  // service additions
  claimDispatchWindow(campaignRowId: string): Promise<boolean>   // casStore.setIfAbsent(`mm:${id}:dispatch-window`, true, 55_000), fail-open like broadcasts
  dispatchBatch(input: { campaignRowId: string; isQuotaReached: () => Promise<boolean>; isWorkspaceBlocked: () => Promise<boolean> }): Promise<{ sent: number; outcome: "continue" | "dayDone" | "paused" | "ended" }>
  finalize(campaignRowId: string): Promise<void>
  ```
- `recordMarketingMessageUsage` copies the three increments from `apps/worker/src/events/analytics/message.ts` `handleBotMessageSent`: `incrementBy` `botMessages`, then `monthlyBotMessages` for the owner, then `workspaceUsageService.increment(workspaceId, "botMessages", count)`.
- The quota check and the workspace-blocked check are passed in as callbacks so the worker can supply `isBotMessageQuotaReached` / `isBlockedWorkspace`.
- `dispatchBatch` algorithm, for status `sending` only:
  1. Blocked workspace → `pause(workspaceBlocked)`. Quota reached → `pause(quotaReached)`. No page connection → `pause(pageNotConnected)`. No grant → `pause(grantInvalid)`.
  2. `limit = MM_SENDS_PER_MINUTE`. For daily, `limit = min(limit, dayTarget - daySent)`. If that is ≤ 0 → `dayDone`.
  3. Build the payload once with `buildMarketingMessagePayload(mmContentSchema.parse(row.content))`.
  4. For each `listDue` recipient, sequentially, call `sendMarketingMessage` and handle the result:
     - **ok** → `sent`, set `trackingId`, `sentAt`, `attempts + 1`; `setFirstSentAt`; count it.
     - **uncertain** → `unconfirmed`, `sentAt = now`, `attempts + 1`, error message stored; count it as a send for usage (*plan call*: Meta probably charged).
     - **meta**: switch on `classifyMarketingMessageError(code)`:
       - `dailyBudget` → stop the loop. Recipient unchanged. Outcome `dayDone`. **(Review Focus 3)**
       - `lifetimeBudget` → `failRemaining(code)`, then `transition → completed/lifetimeBudgetReached`. Outcome `ended`.
       - `notReady` / `transient` → stop the loop. Recipient unchanged. Outcome `continue`.
       - `recipientTiming` → if `attempts === 0`: `attempts = 1`, `nextAttemptAt = nextEligibleAt ?? now + MM_RETRY_DELAY_MS`. Otherwise `failed`.
       - `recipientPermanent` / `unknown` → `failed`, with `errorSource "send"`.
       - `campaignInactive` → if `metaEndsAt && metaEndsAt <= now`: `failRemaining`, then `completed/campaignEnded`, outcome `ended`. Otherwise `pause(metaBlocker)`.
       - `campaignBlocker` → `pause(metaBlocker, code, message)`. When the code is 190, also `facebookMarketingMessagesService.markAuthInvalid`.
       - `contentInvalid` → `failRemaining`, then `transition → failed/contentRejected`. Outcome `ended`.
  5. After the loop: `incrementDaySent(by = sends)` and `recordMarketingMessageUsage(count)`.
  6. If daily and `dayDone`: `transition sending → waitingNextDay` with `nextDayAt` = the next midnight in `timezoneName` (date-fns-tz `fromZonedTime(startOfDay(addDays(toZonedTime(now, tz), 1)), tz)`).
- `finalize(id)`, for status `sending`, using `countOutcomes`:
  - `pending === 0`, and either `unconfirmed === 0` or the oldest unconfirmed is older than `MM_UNCONFIRMED_GRACE_MS`.
  - Then mark the stale unconfirmed rows failed with message `"outcomeUnknown"` and `transition → completed` with `completedAt`.
  - If any `pending` rows have a future `nextAttemptAt`, do NOT complete.

- [ ] **Step 1: Write the failing tests:**
  - `sends each due recipient and stores trackingId`
  - `2300054 mid-batch stops, leaves rest pending, sets waitingNextDay at next local midnight`: tz `Asia/Ho_Chi_Minh`, now `2026-10-18T10:00:00Z` → `nextDayAt` `2026-10-18T17:00:00.000Z`. The 2300054 recipient has `attempts` 0. **(Review Focus 3)**
  - `uncertain result marks unconfirmed and never re-sends it`: a second `dispatchBatch` does not call send for that recipient. **(Review Focus 2)**
  - `recipientTiming retries once at nextEligibleAt then fails on the second error`
  - `contentInvalid fails remaining recipients and the campaign with contentRejected`
  - `2300053 completes with lifetimeBudgetReached`
  - `campaign blocker 2300011 pauses with metaBlocker and code`
  - `190 pauses grantInvalid path and marks auth invalid`
  - `quota reached pauses before any send`
  - `daily dispatch never exceeds dayTarget - daySent`
  - `records usage for ok and uncertain sends only`
  - `finalize waits while unconfirmed is younger than grace, then fails them as outcomeUnknown and completes`
  - `finalize does not complete while a retry is scheduled`
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/business test -- delivery-dispatch`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(fb-marketing-messages): dispatch with budget pacing and error classes`.

---

### Task 7: Delivery service — webhooks and stats

**Files:**
- Create: `packages/business/src/facebook-marketing-message-delivery/{webhook.ts,stats.ts}`
- Test: `packages/business/__tests__/facebook-marketing-message-delivery-webhook.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const marketingMessageWebhookValueSchema: z.ZodType<MarketingMessageWebhookValue>   // the three Meta shapes, spec §2
  export type MarketingMessageWebhookEvent =
    | { field: "marketing_message_echoes" | "marketing_message_deliveries"; campaignId: string; subscriptionToken: string; trackingId: string | null; psid: string | null; mid: string | null; timestamp: Date }
    | { field: "marketing_message_delivery_failed"; campaignId: string; subscriptionToken: string; errorMessage: string; timestamp: Date }
  applyWebhook(event: MarketingMessageWebhookEvent): Promise<{ applied: boolean; campaign?: FacebookMarketingMessageModel; recipient?: RecipientModel }>
  getStats(input: { workspaceId: string; id: string }): Promise<MarketingMessageCampaignStats>
  export type MarketingMessageCampaignStats = { status: FacebookMarketingMessageStatus; statusReason: FacebookMarketingMessageStatusReason | null; statusErrorCode: number | null; statusErrorMessage: string | null; startsAt: Date | null; completedAt: Date | null; tokenCount: number | null; counts: { pending: number; sent: number; delivered: number; failed: number; unconfirmed: number }; errors: { errorCode: number | null; errorMessage: string; count: number }[] }
  ```
- Schema notes: `message_id` and the token are strings or numbers in Meta's samples, so coerce to string. `timestamp` is unix seconds.
- `applyWebhook`:
  - Resolve the campaign with `findByCampaignId(campaignId)`. Unknown campaign, or unknown token → `{ applied: false }` without throwing. **(Review Focus 4)**
  - Recipient lookup: `trackingId` first, then `(campaignRowId, token)`.
  - **echoes** → if `pending`/`unconfirmed`, set `sent`. Store `psid`/`mid` when present. Set `trackingId` if null.
  - **deliveries** → `delivered` with `deliveredAt`. This also resolves `unconfirmed`.
  - **failed** → `failed`, `errorSource "webhook"`, `errorCode null`, `errorMessage` from Meta. This applies even after `delivered` (spec call 8).
- `sent` in `getStats` counts sent + delivered. The UI's "sent" means "accepted by Meta".

- [ ] **Step 1: Write the failing tests:**
  - `echo promotes unconfirmed to sent and stores psid/mid` **(Review Focus 2)**
  - `delivery sets delivered`
  - `delivery_failed matches by campaign+token and records webhook error`
  - `unknown campaign id returns applied false and does not throw` **(Review Focus 4)**
  - `unknown token on a known campaign returns applied false`
  - `getStats aggregates counts and returns the error breakdown`
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/business test -- delivery-webhook`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(fb-marketing-messages): apply delivery webhooks and campaign stats`.

---

### Task 8: Worker schedule pipeline

**Files:**
- Modify: `packages/worker-config/src/queues/schedule/index.ts`
- Create: `apps/worker/src/schedule/handlers/{enqueue-marketing-messages.ts,dispatch-marketing-messages.ts,finalize-marketing-messages.ts,process-marketing-message-campaign.ts}`
- Modify: `apps/worker/src/schedule/handlers/register-schedules.ts`, `apps/worker/src/schedule/worker.ts`
- Test: `apps/worker/__tests__/marketing-messages-schedule.test.ts`

**Interfaces:**
- Produces (worker-config; each needs both the `ScheduleJobData` const key and a union member):
  - `enqueueMarketingMessages`, `dispatchMarketingMessages`, `finalizeMarketingMessages`: data `Record<string, never>`.
  - `processMarketingMessageCampaign`: data `{ campaignRowId: string; step: "prepare" | "startDay" | "dispatch" }`.
  - `export const marketingMessageCampaignJobId = (id: string, step: string) => \`mm-campaign-${step}-${id}\``
- The three crons use `{ pattern: "* * * * *" }`, registered like `reconcileBroadcasts`. They are not cloud-only.
- What each handler does:
  - `enqueueMarketingMessages`: under `distributedLock.runExclusive({ key: "schedule:enqueue-marketing-messages", timeoutInSeconds: 55 })`, `listDueToStart(now)` → add `processMarketingMessageCampaign`. Step is `prepare` for `scheduled` and `startDay` for `waitingNextDay`. Options: `jobId: marketingMessageCampaignJobId`, `attempts: 1`, `removeOnComplete: true`, `removeOnFail: true`.
  - `dispatchMarketingMessages`: same lock pattern; `listByStatus("sending")` → add step `dispatch` per campaign.
  - `processMarketingMessageCampaign`:
    - Wrap everything in `withBlockedOwnerGuard(row.workspaceId, …)`. For the `dispatch` step, also pass `isWorkspaceBlocked` so a blocked owner pauses the campaign (D20) instead of skipping it silently.
    - `prepare` → `service.prepare`. `startDay` → `service.startDay`. `dispatch` → `claimDispatchWindow`, then `dispatchBatch({ isQuotaReached: () => isBotMessageQuotaReached(ws), isWorkspaceBlocked: () => isBlockedWorkspace(ws) })`.
    - **Pipeline call:** the blocked-owner guard must not swallow the dispatch step. Resolve `isBlockedWorkspace` first and call `service.pause(workspaceBlocked)` directly when it is true.
  - `finalizeMarketingMessages`: lock, then `listByStatus("sending")` → `service.finalize` for each, sequentially.

- [ ] **Step 1: Write the failing tests** (mock pattern from `__tests__/reconcile-broadcasts.test.ts`):
  - `enqueue adds prepare for scheduled and startDay for waitingNextDay with deterministic job ids`
  - `dispatch cron enqueues one dispatch job per sending campaign`
  - `process dispatch pauses workspaceBlocked when owner is blocked and does not send`
  - `process dispatch skips when the dispatch window is already claimed`
  - `finalize calls service.finalize for each sending campaign`
- [ ] **Step 2:** Run `pnpm --filter worker test -- marketing-messages-schedule`. Expected: FAIL.
- [ ] **Step 3:** Implement and register; route the four types in `schedule/worker.ts`.
- [ ] **Step 4:** Re-run, then `pnpm --filter worker check-types`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(worker): marketing message delivery crons`.

---

### Task 9: Webhook intake, inbox echo, page subscription

**Files:**
- Modify: `integrations/messenger/src/apis/page.ts`: add `"marketing_message_echoes"`, `"marketing_message_deliveries"` and `"marketing_message_delivery_failed"` to `PAGE_SUBSCRIBE_SCOPES`.
- Modify: `integrations/messenger/src/handlers/webhook.ts`: a new branch next to `leadgen`.
- Modify: `packages/worker-config/src/queues/integration/index.ts`: `IntegrationJobAction.processMarketingMessageWebhook`, data `{ pageId: string; field: string; value: unknown }`.
- Create: `apps/worker/src/integration/handlers/marketing-message-webhook.ts`; route it in `apps/worker/src/integration/worker.ts`.
- Modify: `apps/worker/src/integration/handlers/received-message.ts`: export `saveAndBroadcastMessage` and its props type.
- Modify: `apps/worker/scripts/resubscribe-messenger-webhook-fields.ts`: union in the three fields.
- Test: `integrations/messenger/__tests__/webhook-marketing-messages.test.ts`, `apps/worker/__tests__/marketing-message-webhook.test.ts`, the existing `resubscribe-messenger-webhook-fields.test.ts`.

**Interfaces:**
- Consumes: `marketingMessageWebhookValueSchema` and `applyWebhook` (Task 7); `summarizeMarketingMessage` (Task 4).
- Webhook branch: for `entry.changes` whose `field` starts with `marketing_message_`, enqueue `processMarketingMessageWebhook` with `{ pageId: entry.id, field, value }`, then `continue`. Parsing happens in the worker, so an unrecognised shape is logged there and not dropped at the edge.
- Worker handler:
  - Parse with the schema; on failure, `logger.warn` and return without throwing.
  - Call `applyWebhook`. When it returns `applied`, the field is echoes, and `psid` is present: resolve the Messenger integration for `(campaign.workspaceId, pageId)` → inbox, then `contactInboxService.findLatestBySource({ inboxId, sourceId: psid, workspaceId })`.
  - If a contact inbox exists, find its conversation the way `receiveMessage` does for an outgoing echo. Then call `saveAndBroadcastMessage` with an outgoing text message: `summarizeMarketingMessage(content)`, `sourceId = mid`, `contentAttributes.metadata = { type: "marketingMessage", campaignRowId }`.
  - If there is no contact inbox, skip it and create nothing (spec call 5).

- [ ] **Step 1: Write the failing tests:**
  - messenger: `marketing_message_deliveries change enqueues processMarketingMessageWebhook with pageId`
  - messenger: `PAGE_SUBSCRIBE_SCOPES includes the three marketing_message fields`
  - worker: `invalid payload is logged and does not throw`
  - worker: `echo with psid and existing contact inbox saves an outgoing message`
  - worker: `echo with psid but no contact inbox creates nothing`
  - worker: `applied false does nothing further`
  - script: `resubscribe adds marketing_message fields to existing subscriptions`
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/integration-messenger test -- webhook-marketing` and `pnpm --filter worker test -- marketing-message-webhook resubscribe`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(fb-marketing-messages): ingest marketing message webhooks`.
- [ ] **Step 6 (ops note, put it in the PR description):** after deploy, add the three fields in the Meta app's Page webhook config, then run `pnpm --filter worker backfill:messenger-webhook-fields`. V3 is still open: compare the first real payloads against the schema.

---

### Task 10: Builder operations, actions and public API

**Files:**
- Create: `apps/builder/src/features/facebook-marketing-messages/lib/campaign-operations.ts` (`import "server-only"`)
- Modify: `actions/create.action.ts`, `actions/update.action.ts`, `actions/delete.action.ts`. Each action becomes a thin wrapper.
- Create: `actions/campaign-control.action.ts`: `stopMarketingMessageAction`, `resumeMarketingMessageAction`, `sendMarketingMessageAction`.
- Create: `api/public.ts`; modify `apps/builder/src/routers/public.ts` (key `facebookMarketingMessages`).
- Test: `apps/builder/__tests__/marketing-messages-public-api.test.ts`; update the existing `marketing-messages-create-action.test.ts` / `-update-action.test.ts` imports.

**Interfaces:**
- Produces (`campaign-operations.ts`):
  ```ts
  createMarketingMessage({ workspace, input }): Promise<FacebookMarketingMessageModel>   // moved unchanged
  updateMarketingMessage({ workspace, id, input }): Promise<FacebookMarketingMessageModel>  // moved; refuses content change when row.firstSentAt != null (ChatbotXException "mmContentLocked")
  deleteMarketingMessages({ workspace, ids }): Promise<void>   // per id: deleteMessageCampaign (grant token) then service.remove; Meta error aborts that id
  stopMarketingMessage / resumeMarketingMessage / sendMarketingMessage({ workspace, id }): Promise<FacebookMarketingMessageModel>  // → delivery service
  ```
- `updateMarketingMessage` deep-compares `content` with the stored row, so a name or budget edit is still allowed after the first send.
- Public router, scope `workspaceTokenAuthAPIForScope("ads")`.
  - *Plan call:* the `ads` scope already guards ad spend, and a new scope would need its own token UI and i18n cascade.
  - Every procedure uses `spec: mcpSpec({ visibility: "default" })`, tags `["Marketing Messages"]`, and a description naming where each id comes from.

| Key | Method + path | Calls |
|---|---|---|
| `pages.list` | GET `/v1/marketing-messages/pages` | the existing private handler logic |
| `adAccounts.list` | GET `/v1/marketing-messages/ad-accounts` | same |
| `campaigns.list` | GET `/v1/marketing-messages/campaigns` | `facebookMarketingMessagesService.list` + status fields |
| `campaigns.get` | GET `/v1/marketing-messages/campaigns/{id}` | `find` + `deliveryService.getStats` |
| `campaigns.create` | POST `/v1/marketing-messages/campaigns` (201) | `createMarketingMessage` |
| `campaigns.update` | PUT `/v1/marketing-messages/campaigns/{id}` | `updateMarketingMessage` |
| `campaigns.delete` | DELETE `/v1/marketing-messages/campaigns/{id}` | `deleteMarketingMessages` |
| `campaigns.stop` / `resume` / `send` | POST `…/campaigns/{id}/stop` etc. | campaign-operations |
| `audiences.list` / `liveStatus` | GET `…/audiences`, `…/audiences/live` | existing private logic |
| `audiences.create` | POST `…/audiences` | JSON `{ adAccountId, pageId, name, description?, headers: string[], rows: string[][] }`, validated with the same limits (100,000 rows); feeds the audience service's existing create path in place of the file parser |
| `audiences.uploadMore` | POST `…/audiences/{id}/rows` | same body minus account/page/name |
| `audiences.delete` | DELETE `…/audiences/{id}` | existing service delete |

- Add `/v1/marketing-messages/campaigns/{id}/stop` to `READ_ONLY_POST_PATHS` in `authorize-workspace-access.ts`, the way broadcast stop is (stopping must work after trial expiry).
- A missing or expired grant → `ChatbotXException` with the message "Connect Marketing Messages in the ChatbotX app first" (i18n key). The OAuth connect stays UI-only (exempt).

- [ ] **Step 1: Write the failing tests** (captured-procedure pattern from `__tests__/broadcasts-public-api.test.ts`):
  - `registers every procedure with scope ads and the expected paths`
  - `campaigns.get returns status, counts and errors from getStats`
  - `campaigns.update rejects content change after firstSentAt with mmContentLocked` (operations test)
  - `campaigns.update allows a budget change after firstSentAt`
  - `campaigns.delete deletes the Meta campaign before the row and keeps the row when Meta fails`
  - `audiences.create rejects more than 100000 rows`
- [ ] **Step 2:** Run `pnpm --filter builder test -- marketing-messages`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement: move the operations, thin the actions, write the router, and nest it in `routers/public.ts`.
- [ ] **Step 4:** Re-run, then `pnpm --filter builder check-types`. Expected: PASS.
- [ ] **Step 5:** Run the `cli-mcp-docs` skill and apply its doc/skill updates.
- [ ] **Step 6:** Commit `feat(fb-marketing-messages): public API and campaign controls`.

---

### Task 11: Builder UI — status, stats, controls

**Files:**
- Modify: `components/marketing-messages-table.tsx`: a status badge column and sent/delivered/failed columns. Page with `useIntervalRouterRefresh({ enabled: anyActive, intervalMs: 30_000 })`, where active means `scheduled|sending|waitingNextDay`.
- Create: `components/campaign-status-badge.tsx`, `components/campaign-detail.tsx`, `lib/error-labels.ts` (known code → i18n key, falling back to the raw message).
- Modify: `src/app/space/[workspaceId]/fb-marketing-messages/[id]/page.tsx`. It renders the detail (status, reason, counts, error breakdown, Stop/Resume/Send buttons) above the edit form. The content editors are disabled when `firstSentAt` is set.
- Modify: the delete dialog copy, which warns that the Meta campaign is deleted too.
- Modify: all 21 `apps/builder/messages/*.json`. New keys go under `facebookMarketingMessages.delivery.*`: statuses, reasons, error labels, buttons, delete warning, and the content-locked hint.
- Test: `apps/builder/__tests__/marketing-messages-error-labels.test.ts`

**Interfaces:**
- Consumes: the Task 10 actions and `getStats`.
- The table's counts come from a server-side `getStats` per row in the list page. *Plan call:* lists are small. Batch through one repository query if a list exceeds 50 rows.

- [ ] **Step 1: Write the failing test:** `errorLabelKey(2300034)` → `"facebookMarketingMessages.delivery.errors.optedOut"`; `errorLabelKey(null)` → `null`.
- [ ] **Step 2:** Run `pnpm --filter builder test -- error-labels`. Expected: FAIL.
- [ ] **Step 3:** Implement the components, wiring and i18n. Control buttons call the actions bound with `.bind(null, workspaceId, id)`, then `router.refresh()`. There are no TanStack caches for campaigns, so no invalidation is needed. Audience mutations keep their existing invalidation.
- [ ] **Step 4:** Run `pnpm --filter builder test -- marketing-messages`, `pnpm --filter builder check-types` and `pnpm --filter builder lint` (i18n-check). Expected: PASS.
- [ ] **Step 5:** Commit `feat(fb-marketing-messages): campaign delivery status and stats UI`.

---

### Task 12: Final gate

- [ ] **Step 1:** Run `pnpm lint`. Expected: exit 0 (agent-instructions, drift, ultracite).
- [ ] **Step 2:** Run `pnpm --filter @chatbotx.io/database test`, `pnpm --filter @chatbotx.io/business test`, `pnpm --filter @chatbotx.io/integration-facebook-ads test`, `pnpm --filter @chatbotx.io/integration-messenger test`, `pnpm --filter worker test` and `pnpm --filter builder test`. Expected: all pass.
- [ ] **Step 3:** Dispatch the `invariant-guard` agent on the branch diff and fix anything it reports.
- [ ] **Step 4:** Commit any fixes. The migration is still unapplied until the user approves `db:migrate`.
