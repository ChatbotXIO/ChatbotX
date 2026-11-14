# LINE channel integration — design

Date: 2026-11-08 · Branch: `feat/line-channel-integration`

## Intent

LINE becomes one more messaging channel in ChatbotX, so a workspace can run its bot on LINE the same way it runs on Telegram, Zalo or Messenger. The bar is **parity with the existing channels**: everything our other channels already do, LINE does too, as far as the LINE Messaging API allows. Nothing LINE-only is added in this release.

## Goals

- A workspace owner connects a LINE Official Account by entering two fields from the LINE Developers console: **Channel ID** and **Channel secret**. Nothing else is required.
- On connect: validate the credentials live, create a LINE inbox, and register ChatbotX's webhook URL with LINE.
- Inbound 1:1 messages land in the inbox and drive flows, keywords, default replies and AI agents. Supported content: text, image, video, audio, file, location, sticker. Stickers are stored as a readable placeholder/text, not rendered.
- Button taps (postback) and quick-reply taps route like they do on Telegram.
- Flows can send everything Telegram supports today: `sendText`, `sendImage`, `sendMultipleImages`, `sendVideo`, `sendAudio`, `sendFile`, `sendGif`, `sendQuickReply`, `sendCard`, `sendCarousel`. Buttons and carousels use LINE-native formats (template messages / quick reply).
- Broadcasts: a LINE "all contacts" audience with no 24-hour window (mirrors `telegramAllContacts`).
- Sequences, live-chat agent replies, and contact profile (display name + avatar) work.
- Typing indicator via LINE's loading animation.
- Public API for connect / list / get / disconnect (AGENTS.md invariant 23), then the `cli-mcp-docs` pass.

## Non-goals (this release)

- LINE-only features: sending stickers or Flex messages from flows, rich menus, LINE emoji, imagemaps, LIFF, narrowcast/audiences, account link, beacons, membership.
- Group chats and multi-person rooms as conversations (see decisions).
- Message-template broadcasts (LINE has no WhatsApp-style template concept).
- Read receipts / mark-as-read (no other token channel does it; optional later).

## Anti-goals (would be a failure even if it "works")

- Asking users for a long-lived channel access token or any field beyond Channel ID + Channel secret.
- Group messages leaking into the 1:1 conversation path (wrong contact, wrong replies).
- Accepting webhooks without verifying `x-line-signature`.
- Duplicate sends on retry (burns the customer's monthly LINE quota).
- Retry loops when the LINE account's monthly quota is exhausted.

## Constraints

- Follow the `integration-channel` skill (`.agents/skills/integration-channel/`) and its four phases, using `integrations/telegram` as the template. Also read `orpc-api`, `drizzle-database`, `workspace-purge`, `builder-ui-i18n`, `security-review` and `cli-mcp-docs` at the points CLAUDE.md maps them.
- Data access chain: action / API handler → service in `packages/business` → repository → DB. Never `db` in `apps/` or `integrations/`.
- No dynamic `import()` in `integrations/*`. Logging is structured pino with `{ err }`.
- Never run `db:migrate` automatically. Generate the migration, inspect it, and wait for user approval.
- Adding `line` to `channelTypes` cascades through every `Record<ChannelType, …>`. Grep both the single-line and the multi-line forms. Known hits: `CHANNEL_CAPABILITIES`, `CHANNEL_FLOW_POLICIES`, `INBOX_IMAGE_SUPPORT`, `INBOUND_WEBHOOK_CHANNEL_SPECS`, `contact-inbox-identity.ts`, `profile-refresh/rules.ts`, `inbox/utils.ts` (three link maps), `inbox/connect-channel.ts`, `catalog-sources.ts`, `channel-fetchers.ts`, `refresh-channel-tokens.ts`, `inbox_labels/index.ts`, `inbox-icon.tsx`, `message-input.tsx` (`CHANNEL_WINDOW_SECONDS` = 0), `contact-detail.tsx`, `channel-identity.ts`. Also update `integrationTypes`, the `channel-registry` registry and its identifier switch, `getIntegrationFromContactInbox`'s table map, the `connections` registry, and `store-bindings` / `orphaned-integration-cleanup`.
- Webhook URLs are built with `buildBrokerCallbackUrl()` (broker host, white-label safe).

## LINE facts the design relies on

Sources: https://developers.line.biz/en/reference/messaging-api/ and the docs pages linked in the request. Facts marked *(verify)* must be confirmed against a live channel during the build.

- **Tokens from ID + secret**:
  - Short-lived v2 (`POST https://api.line.me/v2/oauth/accessToken`, `grant_type=client_credentials`) lasts 30 days. At most 30 valid at once *(verify)*.
  - Stateless v3 (`POST /oauth2/v3/token`) lasts 15 minutes, has no cap, and cannot be revoked.
  - Long-lived and v2.1 JWT tokens are not possible with ID + secret alone.
- **Webhook**:
  - Body is `{ destination, events[] }`. `destination` is the bot's user ID, the same as `GET /v2/bot/info` `.userId`.
  - Signature: `x-line-signature` = base64(HMAC-SHA256(channel secret, raw body)).
  - Dedupe on `webhookEventId`. `deliveryContext.isRedelivery` is set on retries.
  - URL can be set via `PUT /v2/bot/channel/webhook/endpoint` and tested via `POST /v2/bot/channel/webhook/test`.
  - The console's **"Use webhook"** toggle appears to have no API *(verify)*.
- **Events used**: `message`, `postback`, `follow` (also fires on unblock), `unfollow` (= blocked). Also the group events `join`, `leave`, `memberJoined`, `memberLeft`, ignored here. Source `type` is `user` | `group` | `room`.
- **Inbound media**: when `contentProvider.type === "line"`, fetch `GET https://api-data.line.me/v2/bot/message/{id}/content` with the bearer token. The content expires after a while, so download at receive time.
- **Sending**:
  - `reply` needs a `replyToken`. It is single-use, expires within about a minute, and is free.
  - `push` sends to a user ID at any time and counts toward the monthly quota.
  - At most 5 message objects per request.
  - Send `X-Line-Retry-Key` (UUID) and reuse it on retries. A 409 means the request was already accepted.
  - No 24-hour window: push works for any friend who hasn't blocked the bot.
- **Message objects**: text (max 5000), image (HTTPS, JPEG/PNG, original + preview), video (mp4 + preview), audio (m4a + `duration` ms required), template (buttons: up to 4 actions; confirm; carousel: up to 10 columns, up to 3 actions each, every column must have the same number; image carousel), quick reply (up to 13 items). `altText` is required on templates. Check exact char limits against the reference *(verify)*.
- **Profile**: `GET /v2/bot/profile/{userId}` returns `displayName`, `pictureUrl`, `statusMessage`. Friends only.
- **Typing**: `POST /v2/bot/chat/loading/start` `{ chatId, loadingSeconds }`, 1:1 only.

## Decisions

### Decided by the user

- Scope is parity with existing channels. No LINE-only features.
- The only user inputs are Channel ID and Channel secret.

### Decided in conversation (proposed by Claude, accepted by the user)

1. **Reply first, push as fallback.** When a fresh reply token exists for the contact, use `reply`, which is free. Otherwise use `push`.
2. **Group chats behave like Telegram groups today.** Events whose `source.type` is `group` or `room` never reach `incomingMessage`. The bot only converses 1:1. If Telegram feeds group activity to leaderboard scoring through `CHANNEL_AUDIENCE_EVENT_JOB_NAME`, LINE may do the same. That is optional and the builder decides.
3. **One workspace per LINE channel.** There is a unique index on the LINE channel identity, the same as Telegram's `botId`.
4. **Quota exhaustion fails cleanly, per message, like every other channel.**
    - Map LINE's quota error (HTTP 429 with a "monthly limit" message) to `ChannelErrorCategory.QUOTA_EXCEEDED`. That category is in `PERMANENT_CATEGORIES` (`packages/sdk/src/lib/channel-error-codes.ts`).
    - The worker then swallows the error without retrying (`shouldSuppressRetryableChannelError` in `apps/worker/src/chat/utils/retry.ts`) and records it once as a `message:failed`.
    - A broadcast or sequence keeps going and each remaining send fails individually. This is exactly how Zalo handles its OA quota codes (`-115`, `-1441`, … in `integrations/zalo/src/lib/error-mapper.ts`). WhatsApp, Instagram and Threads do the same.
    - No pause/stop and no upfront quota check, because no channel has one. This was checked at the user's request.
    - Map rate-limit 429s to `RATE_LIMITED` (retryable).

### Claude's calls after the conversation (flagged for the user's review)

5. **Block / unblock.** `follow` and `unfollow` go to `CHANNEL_AUDIENCE_EVENT_JOB_NAME` exactly like Zalo (`integrations/zalo/src/handlers/webhook.ts`). This replaces the "mark unsubscribed" idea from the conversation, because no channel has such a state. Sending to a blocked user maps to `ChannelErrorCategory.USER_BLOCKED` in a LINE `error-mapper.ts`.
6. **`follow` does not start a flow and does not create a contact** (Zalo parity). The contact is created on the first message. A welcome-on-follow can be added later.
7. **Token strategy: short-lived v2 (30-day) token on the existing oauth2 refresh machinery.**
   - Store auth as `authType: "oauth2"` with `clientId` = Channel ID, `clientSecret` = Channel secret, and `tokens.{accessToken, expiresAt}`. There is no refresh token.
   - `refreshAuth` simply issues a new token with client credentials.
   - This reuses `Integration.invokeWithRefresh` (proactive refresh at under 5 minutes to expiry, reactive refresh on `AuthException`, `AuthStore.withLock`, `markOffline`) and the scheduled `refresh-channel-tokens` dispatcher (add `refresh-line-tokens.ts` + register the schedule).
   - The lock keeps us far under the 30-token cap. If simple, revoke the old token after a successful refresh.
   - Why not v3: 15-minute tokens would mean a DB write about every 10 minutes per active channel, and no existing channel uses that shape.
8. **Webhook routing.**
   - URL: `buildBrokerCallbackUrl("/integrations/line/webhook?channelId=<channelId>")`.
   - Special-case `line` in `apps/builder/src/app/integrations/[...integration]/webhook.ts` beside `handleTelegramWebhook`. Look up the row by `channelId`, then verify the HMAC with that row's secret over the **raw** body before parsing.
   - Also confirm that `destination` equals the stored bot user ID.
   - Enqueue `incomingMessage` with `integrationIdentifier` = bot user ID (or channel ID; pick one and use it consistently in the registry switch).
9. **Reply-token plumbing.**
   - On inbound, stash `replyToken` in Redis under `(botUserId, userId)` with about a 50 s TTL.
   - At send time, take it atomically (`GETDEL`). If present, use `reply`; otherwise `push`.
   - The builder may choose a different carrier, such as passing it through the conversation context, if that fits the worker path better. The behaviour above is the requirement.
10. **More than 5 messages.** A flow step or agent send that produces more than 5 LINE message objects is split into batches of 5. Only the first batch can use the reply token; the rest are pushed.
11. **Flow-step → LINE mapping** (in `CHANNEL_FLOW_POLICIES.line`):
    - `sendText` without buttons → text. With buttons → buttons template. If the text exceeds the template text limit, send a text message followed by a buttons template whose text is a short repeat or the button label (builder chooses).
    - `sendCard` → buttons template with a thumbnail.
    - `sendCarousel` → carousel template. Pad or trim actions so every column has the same count. The validator enforces at most 10 cards and at most 3 buttons.
    - `sendQuickReply` → quick reply items on the preceding message, with at most 13.
    - Images, video, audio, file, and gif → the corresponding object. A gif is sent as an image. `sendFile` has no LINE file message type for bots, so send the file URL as text (builder confirms there is no better option).
    - Audio requires `duration`. Derive it if known; otherwise use a safe default (builder decides).
    - Button types:
      - `openWebsite` → `uri` action.
      - Postback-like types → `postback` action, using `encodeButtonPayload` as Telegram does.
      - `callPhoneNumber` → `uri: tel:`.
    - Other button types are unsupported, so the policy rejects them at publish.
    - Policy limits come from the LINE reference, not from Telegram's numbers.
12. **Incoming media** is downloaded at receive time and stored via `storeIncomingImage` / the media storage prefix, the same as Telegram's `downloadAndUploadFile`. Stickers become a text placeholder that includes `packageId`/`stickerId`.
13. **Profile.** The `getProfile` handler uses `/v2/bot/profile/{userId}`. In `profile-refresh/rules.ts` set `line: { inbound: "channelApi", onDemand: true }`.
14. **Inbox link** (`inbox/utils.ts`): `https://line.me/R/ti/p/<basicId>` (store `basicId` from bot info). Post and message links are `null`, like Telegram.
15. **Disconnect mirrors Telegram exactly.**
    - `telegramIntegrationService.disconnect` deletes the integration row and calls `connectionStateService.disconnectInbox`. The `Connection` row stays (`onDisconnect: "keep_row"`).
    - Reconnecting the same channel in the same workspace revives it, using the `connectionRepository.findByProviderSourceId` path in `connect`.
    - Also add the case to workspace-lifecycle teardown (`removeIntegrationRow`).
    - Leave the webhook endpoint at LINE, since LINE has no "unset". Events for an unknown `channelId` are acked and dropped.
16. **Webhook overwrite.** On connect, `GET` the current endpoint first, then `PUT` ours unconditionally. This matches Telegram's `setWebhook`, which also overwrites. If the previous URL was different and not ours, return it in the connect result as `previousWebhookUrl` and log it, so the UI can show a notice. No confirm or force step.
17. **Reply failures.**
    - A 400 for an invalid or expired reply token means nothing was sent, so retry immediately as `push` with a fresh `X-Line-Retry-Key`.
    - A timeout or 5xx on `reply` has an unknown outcome and reply has no retry key. Do **not** push immediately. Log the failure and fail the send as a normal retryable error, so the job's own retry handles it.
    - On that retry the token has been consumed (`GETDEL`), so the retry goes out as `push`. This accepts a rare duplicate only after a real upstream error, and keeps the code simple.
    - Slow paths, like AI agent replies, use reply only if the token is still in Redis. The TTL handles this.
18. **Connect UX for "Use webhook".**
    - After `PUT` endpoint, call the webhook test endpoint and keep the connect successful either way.
    - If LINE reports the webhook is not enabled or the test fails, the settings page shows an i18n'd instruction to turn on "Use webhook" (and turn off auto-reply messages) in the LINE Official Account Manager.
    - Also expose a "test webhook" operation through the public API.

## Data model

New table `IntegrationLine`, mirroring `IntegrationTelegram`:

- `sharedColumns`, `workspaceId`, `inboxId` (unique)
- `auth` jsonb
- `channelId` text (unique)
- `botUserId` text (unique)
- `basicId`, `name`, `pictureUrl`
- `tokenRefreshError` (like Zalo)

Add a relations file plus **both** edits in `relations/index.ts`. Cover it in the workspace-purge strategy with indexed FKs. Bind it in `connection/store-bindings-channels.ts`.

## Public API (built first)

`features/integration-line/api/public.ts`, nested in `routers/public.ts` behind `workspaceTokenAuthAPIForScope`. Mirror `zaloChannelsPublicRouter`, and reuse the generic connections public API instead if it already covers token-strategy channels.

| Operation | Purpose |
|---|---|
| connect | Takes `channelId` and `channelSecret`; returns the inbox id, bot info, and webhook status |
| list | List LINE channels in the workspace |
| get | Get one LINE channel |
| disconnect | Disconnect a LINE channel |
| testWebhook | Run the webhook test and return the result |

The settings UI calls the same service. Then run the `cli-mcp-docs` skill.

## Left to the builder

- Exact LINE text and label limits. Read them from the reference and encode them in the policy.
- Which identifier is the queue's `integrationIdentifier`.
- Reply-token carrier details, within decision 9.
- Audio duration fallback.
- Whether group activity feeds leaderboards.
- Icons and assets for `inbox-icon.tsx`.
- Test layout, per the `testing-workflow` skill. At minimum cover:
  - signature verification (good and bad)
  - group events dropped
  - every flow-step converter
  - the reply→push fallback
  - batching beyond 5 messages
  - error mapping (blocked, quota, rate limit)
  - token refresh

## Open items to verify against a live LINE channel

- Whether `PUT /webhook/endpoint` works while "Use webhook" is off, and what the test endpoint reports in that case.
- The real reply-token lifetime.
- The exact quota-exceeded error body.
- The 30-token cap behaviour.
