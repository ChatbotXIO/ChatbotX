# LINE channel

ChatbotX connects a LINE Official Account (Messaging API channel) per workspace. 1:1 chats only. Code: `integrations/line`, builder UI `apps/builder/src/features/integration-line`, public API `lineChannels.*` (`/v1/line-channels`). The database migration `packages/database/drizzle/20261109020727_add_integration_line` must be applied before use.

## Setup

1. In the LINE Developers console open the Messaging API channel, then Basic settings. Copy the **Channel ID** and **Channel secret**. These are the only two inputs.
2. Connect in the builder (Channels, LINE) or with `POST /v1/line-channels` (CLI: `chatbotx line-channels create`).
3. In LINE Official Account Manager turn **Use webhook** ON and **Auto-reply messages** OFF.

## Webhook

- URL: `<broker>/integrations/line/webhook?channelId=<id>` (built with `buildBrokerCallbackUrl()`). Connect sets it automatically: GET the previous endpoint, then PUT ours. If a different URL was replaced, the previous URL is reported.
- After connect (post-commit) a webhook test runs. `active` in the response reflects LINE's "Use webhook" toggle. `POST /v1/line-channels/{id}/test-webhook` re-checks; it sends no messages and uses no quota.
- Disconnect does not clear the URL at LINE. Events for an unknown `channelId` are acked and dropped.

## Signature

`x-line-signature` is HMAC-SHA256 (base64) over the raw body, computed with Web Crypto (the module is reached by the Edge-traced router, so no `node:` imports). The payload `destination` must equal the bot userId stored at connect.

## Inbound

- Groups and rooms are ignored.
- `follow` / `unfollow` become audience events. `follow` does not create a contact; the contact is created on the first message.
- Blocking the bot sends `unfollow`; unblocking sends `follow`. They are used only for leaderboard scoring; the block itself is not stored.
- The contact's locale comes from the profile's `language` (e.g. `vi`).

## Sending: reply vs push

- Reply is free. The reply token is stashed for 5 min in Redis (`ctx.ephemeral`) and is single-use. LINE documents no fixed lifetime; in live testing replies were accepted 55 s, 3 min and 10 min after the user's message. Push is the fallback and counts toward the monthly message quota.
- Messages go in batches of 5 (LINE limit). Only the first batch can use the reply token.
- Invalid reply token: immediate push. Reply 5xx or timeout: retryable failure; the next attempt pushes.
- Each push carries an `X-Line-Retry-Key`; a 409 means LINE already accepted it.
- Partial sends: when a send of more than 5 messages fails on a later batch, the batches already delivered are saved as a checkpoint in `ctx.ephemeral` (10 min TTL, keyed by recipient + SHA-256 of the message objects) and the error is rethrown. The job's retry takes the checkpoint and sends only the remaining batches, without the reply token. No checkpoint is written on success or when the first batch fails.
- Limit: if the retry's message objects differ from the first attempt (e.g. re-rendered variables), or the store is down, the retry resends from the first batch.

## Errors and quota

- Monthly-limit 429: `QUOTA_EXCEEDED`, permanent. Each send fails individually; there is no pause.
- Other 429: `RATE_LIMITED`, retryable.
- **A push to a user who blocked the account returns HTTP 200** with a message id; LINE drops it silently and does not count it. So the send API never tells us about a block, and block state is not tracked: a blocked contact stays in broadcast audiences and sends to it are recorded as delivered. The profile endpoint returns 404 for a blocked user.
- Recipient never added the account as a friend: LINE's 400 maps to `USER_BLOCKED`.

## Flow-step mapping

- Text without buttons: text message(s), split at 5000 characters.
- Everything with buttons in the message body is a **Flex Message**, built by one bubble builder (`flexBubbles` in `integrations/line/src/handlers/message/outgoing-message/flex.ts`); there is no template message any more. Every LINE limit the integration applies is in `LINE_LIMITS` (`limits.ts`).
  - Text with buttons: one bubble, the full text in the body (`wrap: true`), then the buttons in the footer.
  - Card: one bubble: hero image (`20:13`, `cover`) if the card has one, the full title (bold) and subtitle, then the buttons. A card with no button stays a bubble without a footer. An empty title or subtitle is left out (LINE rejects empty text); a card with nothing to show sends nothing.
  - Carousel: one bubble per card, each with exactly its own image, title, subtitle and buttons (no padding, nothing has to match across cards). Up to 12 bubbles per carousel; more continue in a further carousel message, in order. A carousel that ends up with a single bubble is sent as a plain bubble.
  - Image/video/audio/file with buttons: the media, then a bubble whose body is the button labels joined with " / ", then the buttons.
  - Buttons: up to 5 per text step, media step, card and carousel card (the LINE flow policy's `buttonCount` and `cardButtonCount`; Flex itself has no button cap, only the 30 KB bubble size). Each button is sent in its own style, the flow button's `style` (`primary`, `secondary` or `link`, picked in the builder's button dialog or set through the API); a button without one is `link` (LINE's default, `LINE_BUTTON_STYLES.default`), applied in `flexBubbles` only. Labels cut to 20. The same node reaching a contact on another channel is cut to that channel's limit by the worker (see `docs/flows.md`, "Button limits and button styles"); other channels ignore the style.
  - Alt text (notifications, chat list): the text, card title, card titles joined with ", ", or the button labels; cut to 1500; "-" if all are blank.
  - Size budget: a bubble's JSON must stay within 30 KB and a carousel's within 50 KB (UTF-8 bytes, measured by the builder). Nothing is dropped when a message is over: a bubble keeps as many leading buttons as fit and each remaining button follows in its own bubble (its label, then the button), sent as a carousel; content that alone is over 30 KB (only an extreme text) is cut by size into consecutive body bubbles, losing only the title/subtitle styling. Bubbles are packed in order into as many carousels as the 12-bubble and 50 KB limits need. A single `uri` action over ~29 KB would still be rejected by LINE; the 10,000-character URI limit keeps real actions well below that.
  - Taps on the "-" padding buttons of carousels sent before the Flex switch (`LINE_NOOP_POSTBACK_DATA`) are still dropped on receipt.
- Quick replies: up to 13. Postback actions stay postback; URL becomes `uri`; phone becomes `tel:`.
- GIF and file: sent as a text URL.
- Audio: duration falls back to 60000 ms. Video: preview is the video URL (no thumbnail available). Image: preview is the original (LINE caps previews at 1 MB).

## Tokens

A 30-day short-lived v2 token is minted from the client credentials. The daily `refresh-channel-tokens` job (02:00 UTC) refreshes tokens expiring within 3 days, and also rows whose `expiresAt` is missing. A 401 triggers a reactive refresh. A channel holds at most 30 short-lived tokens: issuing a 31st does **not** fail, it silently invalidates the oldest. Anything else minting tokens from the same Channel ID and secret (a staging environment, the customer's own scripts) can therefore kill ours; ChatbotX recovers on the next send (401 → new token → retry), verified live. The old token is not revoked on refresh (it expires on its own), so a concurrent send holding it is never cut off. A token-endpoint 400/401 marks the channel offline; the user must reconnect.

## Ops runbook

- Channel offline: credentials were rotated or revoked in LINE; reconnect with the new secret.
- No inbound messages: run `test-webhook`. If `active` is false, "Use webhook" is off in the console. If the test fails, check the broker URL is publicly reachable and the signature secret matches.
- Replies sound doubled/robotic: "Auto-reply messages" is still on in Official Account Manager.
- Sends failing with `QUOTA_EXCEEDED`: the account's monthly push limit is used up; only reply-token sends still work until the month resets or the plan is raised.
- A webhook URL left on LINE after disconnecting is harmless (events are dropped).
- A conversation where an agent replied from the inbox pauses the bot for 24 h (`botEnabled: false`, `botResumeAt`); keywords and flows are skipped meanwhile. This is shared behaviour, not LINE-specific.

## Public API / CLI / MCP

`lineChannels.connect|list|get|delete|testWebhook`, workspace-token scope `channels`. The routes are deliberately hidden from the default MCP tool set (like `zaloChannels`) because a guard test caps that set at 52; they stay reachable through `search_tools` / `call_tool`. The channel secret is never returned by any procedure. CLI names: `line-channels create|list|get|delete`, and `line-channels test-webhook add` (the derived name for the POST sub-resource).

## Live verification (2026-11-10, Official Account on the free plan, 500 msgs/month)

Verified against a real channel:

- Connect: webhook URL registered, "Use webhook" reported `active: true`, LINE's webhook test returned 200.
- Inbound text, image (downloaded and stored), sticker (`[sticker <package>/<sticker>]`) and location (stored as a location message with coordinates).
- Flow via keyword (pre-Flex, as buttons templates): text with postback, `uri` and `tel:` buttons; image inline; file as a link. Button taps show the button label in the inbox.
- Carousel *template* with uneven buttons (the pre-Flex format): the "-" no-op padding was accepted; tapping it does nothing. `uri` / `tel:` quick replies are accepted.
- Reply vs push: the first message after a user message went out as a free reply; only later messages in the same run counted toward quota.
- Inbox agent replies (text and image).
- Reply-token lifetime and the 30-token cap: see above.
- Block: push returns 200 (see Errors and quota); the `unfollow` event arrives.

Still unverified:

- Flex Messages (the switch on 2026-11-12): text with buttons, card, carousel and media follow-up bubbles, their rendering, the size-budget split, and `uri` / `tel:` / postback taps from a flex button. Covered by unit tests only; the action objects are the same as the live-verified template ones.
- Five buttons per bubble and the `primary` / `secondary` button styles: unit tests only.

- Whether the webhook-endpoint PUT works while "Use webhook" is off, and what the webhook test then reports.
- The exact quota-exceeded error body (the mapper matches the text "monthly limit"); not tested to avoid burning the quota.
- Ops runbook notes not covered above are derived from the code and LINE docs, not from a live incident.
