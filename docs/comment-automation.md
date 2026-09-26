# Facebook & Instagram Comment Automation

This document describes the **comment automation** feature: how a comment on a Facebook
Page post or an Instagram post flows from the webhook to an automated reply, how each
config option is matched and enforced, and the non-obvious pitfalls that have caused
silent failures. It is the reference for anyone touching the comment-automation code.

> Scope: the five `CommentAutomationChannelType` values (`channel-type.ts`) —
> `messenger` (Facebook Pages), `instagram` (Instagram Login), `instagramFacebook`
> (Instagram via Facebook Login), `threads` and `tiktok`. All five share one table, one
> worker loop and one set of filters; the per-channel capability differences are listed
> under [Known gaps](#known-gaps--pitfalls).

## Tables

| Table | File | Role |
|---|---|---|
| `commentAutomationModel` | [`packages/database/src/schema/comment-automation.ts`](../packages/database/src/schema/comment-automation.ts) | One automation config per row: post targeting, keyword filters, public/private reply, hide rules, schedule, options. |
| `commentAutomationReplyModel` | [`packages/database/src/schema/comment-automation-reply.ts`](../packages/database/src/schema/comment-automation-reply.ts) | Dedup ledger: one row per `(automationId, contactId, postId)` written after every successful reply. Unique index `CommentAutomationReply_dedup_idx`. |
| `commentAutomationEventModel` | [`packages/database/src/schema/comment-automation-event.ts`](../packages/database/src/schema/comment-automation-event.ts) | Analytics log: one row per `(automationId, commentId, replyChannel)` — the comment text, the text the bot sent, and `sent`/`failed`. Backs the per-automation **View Analytics** page. Successful rows are kept for the life of the automation; only `status = 'failed'` rows have a 30-day retention, via the `purgeCommentAutomationEvents` cron. |
| `commentAutomationMissModel` | [`packages/database/src/schema/comment-automation-miss.ts`](../packages/database/src/schema/comment-automation-miss.ts) | The inverse of the event log: one row per `(automationId, commentId)` the automation was shown and **declined** — the comment text, when it was posted, and which filter stopped it. Backs the **Misses** column and its drill-down. Never purged. |

Zod partials (option/reply/post/schedule shapes):
[`packages/database/src/partials/comment-automation.ts`](../packages/database/src/partials/comment-automation.ts).

## End-to-end flow

```
Facebook Page / Instagram post (comment added)
  → webhook: messenger (field === "feed", verb === "add")
             instagram, instagram-facebook (field === "comments")
  → BullMQ "incomingComment" job
  → apps/worker/.../received-message.ts  receiveComment()      (save message, gate on active-hours)
  → BullMQ "processCommentAutomation" job (jobId = comment-auto-${commentId})
  → apps/worker/.../comment-automation/index.ts  processCommentAutomation()
       loop over active automations → filters → dispatch public + private reply
  → (AIAgent reply only) BullMQ "commentAIReply" job (delayed)
  → apps/worker/.../comment-automation/ai-reply.ts  processCommentAIReply()
```

Key files:

| Concern | File |
|---|---|
| Webhook parse + enqueue | [`integrations/messenger/src/handlers/webhook.ts`](../integrations/messenger/src/handlers/webhook.ts), [`integrations/instagram/src/handlers/webhook.ts`](../integrations/instagram/src/handlers/webhook.ts), [`integrations/instagram-facebook/src/handlers/webhook.ts`](../integrations/instagram-facebook/src/handlers/webhook.ts) |
| Webhook value schema | [`integrations/messenger/src/schema.ts`](../integrations/messenger/src/schema.ts) (`messengerFeedCommentValueSchema`), `integrations/instagram{,-facebook}/src/schemas.ts` (`instagramCommentEventValueSchema`) |
| Receive + enqueue automation | [`apps/worker/src/integration/handlers/received-message.ts`](../apps/worker/src/integration/handlers/received-message.ts) (`receiveComment`) |
| Automation loop + filters + dispatch | [`apps/worker/src/integration/handlers/comment-automation/index.ts`](../apps/worker/src/integration/handlers/comment-automation/index.ts) |
| Per-channel private DM dispatch | [`apps/worker/src/integration/handlers/comment-automation/private-reply.ts`](../apps/worker/src/integration/handlers/comment-automation/private-reply.ts) (`PRIVATE_REPLY_TEXT_SENDERS`) |
| AI reply generation + delivery | [`apps/worker/src/integration/handlers/comment-automation/ai-reply.ts`](../apps/worker/src/integration/handlers/comment-automation/ai-reply.ts) |
| DB queries (match/dedup/schedule) | [`packages/business/src/comment-automation/service.ts`](../packages/business/src/comment-automation/service.ts) |
| Builder form + actions | [`apps/builder/src/features/fb-comments/`](../apps/builder/src/features/fb-comments/) (Facebook), [`apps/builder/src/features/ig-comments/`](../apps/builder/src/features/ig-comments/) (Instagram) |
| Job types | [`packages/worker-config/src/queues/integration/index.ts`](../packages/worker-config/src/queues/integration/index.ts) |

## Facebook ID formats (critical)

Facebook `feed` webhooks send composite ids. Getting these wrong is the #1 source of
silent failures:

| Field | Format | Example |
|---|---|---|
| `post_id` | `{pageId}_{storyId}` | `2094067177305463_2357494887629356` |
| `comment_id` | `{storyId}_{commentId}` — anchored to the story **even for a reply** | `2357494887629356_1544045903933592` |
| `parent_id` | **Always present.** For a **top-level** comment it points at the post, but **not always as the same string as `post_id`** (see below); only a **reply to another comment** carries that comment's id. | top-level on a reel → `2094067177305463_2357494887629356` |

**`parent_id` on a top-level comment varies by post type.** Production payloads from one
Page (2026-09-11):

| Post type | `post_id` | `parent_id` |
|---|---|---|
| Reel / video | `698869923319232_122151505431003083` | `698869923319232_122151505431003083` — identical |
| Photo | `698869923319232_122101949313003083` | `39455509950714790_122101949313003083` — leading half is the **album**, not the Page |

Only the trailing story id agrees in both. A photo post therefore breaks any
`parentId !== postId` test, which reads every top-level comment as a reply and — with
`ignoreCommentReplies` on by default — swallows the whole automation.

- `parent_id` presence does **not** mean "this is a reply." Use
  `isCommentReply(parentId, postId, commentId)` (`index.ts`), which compares the
  **trailing** ids via `normalizePostId` — never the raw strings.
- A reply is safe to tell apart because `comment_id` stays anchored to the story: a reply
  to `{storyId}_{parentCommentId}` is itself `{storyId}_{replyId}`, so the trailing half
  of `parent_id` (the parent comment) is never the leading half of `comment_id` (the
  story).
- The post picker stores different formats per tab: **published/ads** store the composite
  `{pageId}_{postId}`; **reels** store a bare video id; **manual entry** is whatever the
  user pastes. `matchPost` normalizes both sides on the trailing story id
  (`normalizePostId`) so all three match the webhook `post_id`.
- **Instagram ids are not composite.** Its `comments` webhook carries a bare comment `id`
  and a bare `media.id` (used as `postId`), and the `ig-comments` picker stores those same
  bare media ids — `normalizePostId` is a no-op there.
- **TikTok sends a `0` sentinel, and it must never reach `isCommentReply`.** A production
  top-level `comment.update` (2026-09-21) carries `"parent_comment_id":0` — meaning "no
  parent", not an id — which the snowflake quoting hands on as the string `"0"`. Against
  TikTok's bare ids `isCommentReply` reduces to "a parent that is neither the video nor
  the comment means reply", so `"0"` declined every top-level comment on the channel with
  a `commentIsReply` miss. `resolveParentCommentId`
  ([`integrations/tiktok/src/handlers/webhook.ts`](../integrations/tiktok/src/handlers/webhook.ts))
  normalizes it at the channel boundary: the payload's own `comment_type`
  (`"comment"`/`"reply"`) decides when present, and `0`/empty is dropped otherwise. A new
  channel must do the same — `isCommentReply` is a Meta id-shape heuristic, not a general
  test.

## Config options — matching & enforcement

All matching happens in the automation loop in
[`comment-automation/index.ts`](../apps/worker/src/integration/handlers/comment-automation/index.ts).
Each filter that fails calls `logAutomationSkipped(..., reason)` (logged at `info`) and
`continue`s to the next automation — so a skipped comment always leaves a log line.

| Option / field | Meaning | Enforcement |
|---|---|---|
| `isActive` | Automation on/off | `findActiveAutomations` filters `isActive: true`. |
| `type` | `messenger` \| `instagram` \| `instagramFacebook` \| `threads` \| `tiktok` | `findActiveAutomations` filters `type === channelType`, which is the incoming `integrationType`. The builder writes it: `fb-comments` → `messenger`, `ig-comments` → the selected Instagram variant. |
| `startTime`/`endTime` | Daily active window (workspace tz) | `isWithinSchedule` — lexicographic `"HH:mm"` compare, handles overnight windows; null → always within. |
| `post` (`all` / `postIds`) | Which posts | `matchPost` — `all` always true; `postIds` matches via normalized trailing id. |
| `options.ignoreCommentReplies` (default **true**) | Skip replies-to-comments | Skips only when `isCommentReply(parentId, postId, commentId)` is true. |
| `includeKeywords` (`all`/`equal`/`contain`/`mentions`) | "Reply to" | `matchKeywords` — both sides lowercased and accent-folded (`normalizeForMatch`). `equal` = whole comment equals a keyword; `contain` = substring. `mentions` ignores keywords: the comment must tag **at least** `includeKeywords.mentionCount` (1–5) accounts — `matchMentionCount`, miss reason `mentionCountNotMatched`. The mention list is the same one tag tracking uses (see [Tag tracking](#tag-tracking)). |
| `excludeKeywords` + `excludeKeywordsType` (`equal`/`contain`, default `contain`) | Text must not match | `matchKeywords` — `contain` = substring, `equal` = the whole trimmed comment equals a keyword; lowercased and accent-folded both sides. |
| `options.replyToNewContactsOnly` | Only first-time contacts | `getPriorContactInboxCount(contactId) > 1` → skip. Counts `ContactInbox` rows. |
| `options.replyOncePerUserPerPost` | Once per user per post | `findDedup(automationId, contactId, postId)` exists → skip. |
| `options.replyToUsersWhoCommentedOnOtherPosts` (default **true**) | If off, only engage each user on their first post | When `false`, `hasRepliedOnOtherPost` (a dedup row with a different `postId`) → skip. |
| `options.likeUserComment` | Auto-like the comment | Runs only if the incoming comment's DB message was found (`findBySourceId`). |
| `options.trackUserTags` | Count who the commenter tagged | Not a filter — never skips. Adds the comment's counts to `Contact.totalTagged`/`totalNewTagged`, which back `{{total_tagged}}`/`{{total_new_tagged}}`. Once per comment, ahead of the reply filters. See [Tag tracking](#tag-tracking). |
| `hideComments.*` | Auto-hide matching comments | `applyHideComments` — `all`, `hasPhoneNumber` (PHONE_RE), `hasLink` (LINK_RE, matches bare domains too), `hasKeywords` (case- and accent-insensitive), `hasImage`/`hasVideo`/`hasGif` (attachment lookup, see below), `hasEmoji` (`\p{Extended_Pictographic}` on the text). A row written before `hasGif`/`hasEmoji` existed lacks the keys — absent reads as off. |
| `hideComments.showCommentsAfter` | Auto-unhide delay | Enqueues a delayed unhide job (`jobId = unhide-comment-${commentId}`). |
| `publicReply` / `privateReply` | The reply | See [Reply types](#reply-types). |
| `replyAfter` | Delay before replying | `computeDelayMs` → passed as BullMQ `{ delay }`. |

**All filters must pass** for a reply. After a successful dispatch, `insertDedup` writes a
`(automationId, contactId, postId)` row (used by both `replyOncePerUserPerPost` and
`replyToUsersWhoCommentedOnOtherPosts`) and `incrementRepliesCount` bumps the counter when
`willSendReply` is true.

## Reply types

`publicReply` and `privateReply` each have a `type` and a `value`:

| Type | `value` | Public reply behavior | Private reply behavior |
|---|---|---|---|
| `none` | — | no-op | no-op |
| `text` | the text(s) | Posts a public comment reply per message: `type: "comment"` + `contentAttributes.replyToCommentId`, enqueued as `sendChannelMessage`. **Public may hold up to `COMMENT_REPLY_MAX_TEXTS` messages** — see below. | `PRIVATE_REPLY_TEXT_SENDERS[channelType]` (`private-reply.ts`) → the channel's comment_id-anchored Send API DM. Private stays a single message: Meta accepts one anchored DM per comment. |
| `flow` | flow id | Enqueues `sendFlow` with `flowId` and a `public` `commentAnchor`, so **every** message step of the run is posted as a comment reply — the anchor is not one-shot (`POST /{comment-id}/replies` can be called repeatedly). Runs on the **comment-anchored** conversation. | Same job with a `private` anchor: the flow's **first** message is sent through the comment_id-anchored Send API (comment window, not the 24-hour messaging window); later messages take the normal window-gated path, because Meta allows only one anchored DM per comment. Runs on the **DM** conversation — see below. |

### Which conversation a flow reply runs on

Delivery and state are two different things, and a comment splits them:

- **`commentAnchor` governs delivery.** It rides the `sendFlow` job and decides how each
  outgoing message goes out. `replyChannel: "private"` is one-shot — the first
  message-producing step claims it for the comment_id-anchored Send API, and the anchor
  then keeps travelling marked `spent: true` (`executeMultipleStepsGenerator`, `flow.ts`).
  Every message after that one — later in the same step, or in a later step — is a plain
  DM, which Meta only accepts inside the 24-hour window the contact's own message opens.
  A comment does not open one, so each channel's `sendFlowStep` calls
  `assertCommentPrivateReplyFollowUpDeliverable` (`@chatbotx.io/sdk`) against
  `contact.lastIncomingMessageAt` first: inside the window it sends normally, outside it
  throws `comment_private_reply_already_used`, which `sendFlowStep`'s catch records as the
  message's `sendError` so the inbox says why the rest of the flow never arrived. Before
  this the Send API simply rejected the follow-up and the error was swallowed.
  `replyChannel: "public"` is *not* consumed: it survives every step, node and re-enqueued
  `sendFlow` job of the run, so the whole flow answers on the post.

  **"Message-producing step" means `MESSAGE_PRODUCING_STEP_TYPES` (`flow-utils.ts`), and
  that set is not just the `sendFlowMessage` handlers.** `getUserData` sends a message too
  — its prompt, enqueued through `enqueueFlowStepMessage` from its own handler — so it is
  in the set and forwards the anchor onto that prompt job. This matters because
  "comment → DM that asks a question" is the most natural shape of the feature: while
  `getUserData` was left out, a question-first flow claimed nothing (the one anchored DM
  went unused and the prompt was rejected as an out-of-window DM), and a question after a
  `sendText` reached the channel with no anchor at all, so `isCommentPrivateRun` was false
  and the guard above never ran. Both failed silently, because the challenge is written
  *before* the send and `sendFlowStep`'s catch swallows the channel error — the step still
  returns `wait` and the contact's answer is still captured; only the question never
  arrives. Any future step that sends a message from its own handler rather than through
  `sendFlowMessage` has to be added to the set the same way.

  The claim is made **after** the handler returns and never on an `error` result. Claiming
  by step type up front burned the comment's single anchored DM on a step that sent
  nothing: `getUserData` writes its challenge row before sending, and because it declares
  only `[success, skip]` states an error does not branch — so the run moved on to the next
  step with a spent anchor and the guard refused a private reply that was never sent.
- **`conversationId` governs state.** The flow writes `currentStep` and
  `additionalAttributes.challenge` onto that conversation, and `resolveIncomingTextRouting`
  reads the challenge back off whichever conversation the contact's next message lands on.

A comment anchors its conversation to the post (`Conversation.sourceId = postId`,
`receiveComment`), while DM replies always land on the DM conversation
(`sourceId IS NULL`). So:

| Reply channel | Conversation | Why |
|---|---|---|
| `private` | the **DM** conversation, resolved by `resolveDirectMessageConversationId` (`findDMByContact`, falling back to `findOrCreate({ sourceId: null })`) | The contact answers in the DM. Running the flow on the comment conversation parks its state where no reply can reach it — the flow stalls at its first waiting step with no error anywhere ([#1063](https://github.com/ChatbotXIO/ChatbotX/issues/1063)). |
| `public` | the **comment-anchored** conversation (`ctx.conversationId`, unchanged) | The contact answers with another comment, which `receiveComment` resolves back to that same conversation. Switching this one to the DM conversation would break it. |
| `AIAgent` | **AI agent id** | Enqueues a delayed `commentAIReply` job → `processCommentAIReply` generates text with the **selected** agent (`generateAIReplyText`, tools/rich off) and posts it as a **public comment reply**. | Same job, `replyChannel: "private"` → generated text sent as a **DM**. |

The `AIAgent` path deliberately does **not** reuse the DM auto-responder pipeline
(`processAutomatedResponse`), because that pipeline always uses the workspace *default*
agent and always sends a DM. `generateAIReplyText` generates text only (no tools, no
send), and the comment handler owns the channel routing.

### A `text` public reply can hold several messages

`publicReply.values` is a list; each entry is posted as its own comment reply, in order.
`publicReply.value` holds the first entry as well, so anything still reading the old single-string
shape keeps working — **read both through `resolveReplyTexts`**, never directly, and write through
`normalizeReplyTexts` so the two cannot drift (a client PATCHing only `value` on a row that has
`values` would otherwise be ignored in silence). Rows written before the list existed carry only
`value` and need no migration; `publicReply` is `jsonb`.

Sends are **staggered by 3s** (`PUBLIC_REPLY_SPACING_MS`). Not cosmetic: the chat queue runs
`concurrency: 5` with no limiter, so N jobs sharing one delay are picked up in parallel and the
replies land under the comment in whatever order Facebook accepts them.

**The set is ONE reply, not N.** Exactly the rule a `flow` reply already follows, and it is what
lets the whole analytics layer stay untouched — `CommentAutomationEvent` is unique on
`(automationId, commentId, replyChannel)`, and `settleEvent`/`markDelivered`/`deleteEvent` all
name a row by that triple. So:

- **Sent +1** for the set, never +N — same as `repliesCount`.
- If message #2 fails after #1 landed, the outcome stays **Delivered**; #2's error still surfaces
  as a `sendError` on its `Message` row in the inbox and in the workspace Error Logs.
- Only **all** messages failing records Failed.

Private reply is deliberately excluded: Meta allows one comment-anchored DM per comment.

## Analytics

Each automation has a **View Analytics** row action opening
`space/{ws}/{fb,ig}-comments/{id}/analytics` — an area chart of replies per day, replies
by date, grouped customer comments, grouped bot replies, and an automation-scoped Error
Logs table. It is built on the shared reflink-analytics stack: service and repository in
`packages/analytics`, oRPC routes plus the zustand store and charts in
`packages/analytics-nextjs`, and a thin route shell in the builder.

Four things to know before touching it:

- **The data starts at deploy.** `CommentAutomationEvent` is the only source, and
  nothing backfills it. `CommentAutomationReply` cannot substitute — it holds at most one
  row per contact per post and carries no text, and `Message` has no `automationId` and no
  row at all for a private DM.
- **`repliesCount` and the event count differ by design.** `repliesCount` increments once
  per comment even when both a public reply and a private DM went out; the event log has a
  row per channel. Do not "reconcile" them.
- **The counters measure one half of the comment, chosen by the channel.** Where the
  channel has a comment-anchored DM they measure the DM; on Threads, which has none, they
  measure the public comment reply. The event log is unaffected — it always holds both
  halves, which is why this page shows data for a channel whose list columns once read
  zero. See [Delivery stats](#delivery-stats-list-columns).
- **Retention is per outcome, not per table.** Successful rows are kept for the life of the
  automation, so the date filter is deliberately **unbounded** (down to `lifeTime`). Only
  `status = 'failed'` rows are purged, after `COMMENT_AUTOMATION_ERROR_RETENTION_DAYS`
  (30, matching `ErrorLog` — the two back the same surface), and that window is spelled out
  on the Error Logs card because that is the one panel it thins. The purge scan rides the
  partial index `CommentAutomationEvent_failed_createdAt_idx`; a plain `createdAt` index
  would make the cron walk an ever-growing prefix of kept successful rows.
- **The replies series switches to monthly buckets past 60 days.** An unbounded filter can
  ask for years, so `resolveRangeGranularity` (`packages/analytics/src/lib/time-series.ts`)
  decides the bucket width and BOTH the query and the zero-fill take it from there — fill
  by day a series grouped by month and the chart shows one real point followed by a run of
  zeroes. A monthly key stays a full `YYYY-MM-01` date so the client parses it exactly like
  a daily one, and `formatTimeRangeDate` flips the axis labels on the same 60-day
  threshold.

## Delivery stats (list columns)

The Facebook, Instagram and TikTok list tables carry clickable columns after
`repliesCount` — **Sent / Delivered / Seen / Clicked / Failed / Misses** — the first five
modelled on broadcast. Clicking a number opens the shared `StatsContactsDialog` with the
contacts behind it. **Misses** is the odd one out and has [its own section](#misses).
Threads carries the same columns minus **Seen** and **Clicked**, which are structurally
zero there.

**Which half of the comment they count is decided by the channel, not by the automation**
(`countsTowardStats`, `packages/analytics/src/services/comment-automation-analytics.service.ts`):

- **Channel with a comment-anchored DM** (Messenger, both Instagram logins) — the DM. A
  public comment reply gets no delivery receipt from Meta and has no reader, and every
  rate on the list is measured against `sentCount`, so counting it too would halve a
  comment's own Seen percentage. A Messenger automation configured with no private branch
  therefore reads zero across the row, which is what those columns should say.
- **Channel with no DM at all** (Threads) — the public comment reply, because
  there is nothing to dilute and it is the only reply the automation can send.
  `repliesCount` follows the same rule (`supportsPrivateReply` in the worker loop). Until
  #1238 this channel counted neither, so an automation replying to every comment it was
  shown reported Replies 0, Sent 0 and Misses 100% while working perfectly.
  **Seen** and **Clicked** stay structurally zero there — a comment reply has no read
  receipt and carries no button — so `buildCommentAutomationStatColumns({
  supportsPrivateReply: false })` hides those two columns rather than showing `----`
  forever. The Threads table therefore renders `repliesCount` plus Sent, Delivered,
  Failed and Misses.
- **TikTok moved from the second group to the first** when Comment-to-Message shipped. Its
  counters now measure the DM, Seen and Clicked included, so a TikTok automation with no
  private branch configured reads zero across the row exactly as a Messenger one does —
  a deliberate change from the #1238 behaviour, not a regression. The DM fires only for
  comments TikTok flags as high intent, so expect Sent to sit well below Replies-worth of
  matched comments; the comments that were never flagged land as `failed` rows with a
  readable `errorDetail`, which is what the Failed column and Error Logs show.

The drill-down dialog follows the counter it was opened from: `getContacts` /
`getContactIdsPage` are handed exactly one `replyChannel`, resolved from the automation's
channel, so "select all" can only tag people the column actually counted. The channel is
resolved once per automation and memoised — `CommentAutomation.type` is written at create
and never changes.

The numbers are **lifetime counters on `CommentAutomation`**
(`sentCount`/`deliveredCount`/`seenCount`/`clickedCount`/`failedCount`), not an aggregate:
a nightly cron purges the **failed** `CommentAutomationEvent` rows after 30 days, so
aggregating would make `failedCount` shrink on its own. The event row's matching `*At`
timestamp is what makes each counter exact — every increment is driven by the rows a
conditional `UPDATE ... WHERE <col> IS NULL RETURNING` actually returned, so a redelivered
webhook or a BullMQ retry moves nothing. The drill-down dialog reads the event rows, so its
**Failed** list only reaches back 30 days while that counter keeps going; the other four
lists go back as far as the automation does.

| Column | When it moves | Where |
|---|---|---|
| **Sent** | An event row is inserted — i.e. a reply was attempted. Includes attempts that failed, the same way broadcast derives `sent = delivered + failed`. | `recordEvent` |
| **Delivered** | The channel accepted the send. Meta reports **no** delivery receipt for a public comment reply, so this is that channel's only delivery signal; a private DM is acknowledged synchronously by the Send API, long before any webhook (and a private text DM writes no `Message` row for one to match). | `send-message.ts` success path, `send-flow-step.ts` success path, `executePrivateReply`, `processCommentAIReply` |
| **Seen** | `private` only on every channel — a public comment has no reader, so this column is hidden where the counters measure the public reply. The one outcome that cannot be settled at the dispatch site: a read receipt names the inbox, never the reply, so the lookup runs the other way round, off `CommentAutomationEvent.contactInboxId`. | `commentAutomationAnalyticsService.onSeen`, on the `message:seen` bus |
| **Clicked** | A link or button in a **`flow`** reply was tapped. Attribution rides in `encodeButtonPayload`'s 7th positional field (`ca`), carried to the encoders by `metadata` (see below), so a plain `text` reply has no click to track. | `commentAutomationAnalyticsService.onClicked`, on the `flow:clicked` bus |
| **Failed** | The dispatch threw, the async job gave up, or delivery was blocked before it could go out. First failure wins — a second settle is refused. | `recordEvent`, `settleCommentAutomationFailure` |

**A multi-step `flow` reply is ONE reply.** `sendFlowStep` swallows a step's error and
carries on, so a 3-step reply produces up to three outcomes for a single event row. The
rule is *any step through means the reply arrived*, and it holds whichever order they
settle in:

- A step landing first, then two failing → `settleEvent` refuses the failure
  (`deliveredAt IS NULL` guard). **Delivered 1, Failed 0.**
- A step failing first, then one landing → `markDelivered` clears `failedAt`, puts the row
  back to `sent`, and reports `clearedFailure` so the service takes `failedCount` back
  down. **Delivered 1, Failed 0.** (`errorDetail` stays on the row — the step really did
  fail, and the drill-down still shows it.)
- Every step failing → the first settles, the rest are refused. **Delivered 0, Failed 1.**

`Sent` counts attempts either way, so it stays 1 — the same relation broadcast derives as
`sent = delivered + failed`.

### Misses

**Misses** counts the opposite of everything above: comments the automation was shown and
**declined** to answer. It is the only way a workspace can see what its filters are
swallowing — before it existed the sole trace was a `logger.info` line.

It is backed by a **separate table**, `CommentAutomationMiss`, not by
`CommentAutomationEvent`. That table is unique on `(automationId, commentId,
replyChannel)` with both `replyChannel` and `replyType` `NOT NULL`, and a decline has
neither; every analytics-page query aggregates it directly, so a row type none of them want
would have to be excluded from each one forever after; and misses outnumber replies by
however many automations the workspace runs. Its own key is `(automationId, commentId)` —
an automation sees a comment once and declines it for the first reason that rejects it.

One value per `continue` in the filter chain
(`packages/database/src/partials/comment-automation-miss.ts`):

| `reason` | Gate |
|---|---|
| `outsideSchedule` | `isWithinSchedule` |
| `postNotMatched` | `matchPost` |
| `commentIsReply` | `ignoreCommentReplies` + `isCommentReply` |
| `keywordsNotMatched` | `matchKeywords` |
| `contactNotNew` | `replyToNewContactsOnly` |
| `alreadyRepliedOnPost` | `replyOncePerUserPerPost` |
| `engagedOnOtherPost` | `replyToUsersWhoCommentedOnOtherPosts` off |

A **blocked private reply** is deliberately NOT a miss. That comment passed every filter
and the automation tried to answer it; Meta refused the delivery. It stays a `failed`
`CommentAutomationEvent` row, which is what lets the Error Logs panel explain it.

`missedCount` on `CommentAutomation` is exact for the same reason the delivery counters
are: the increment counts the rows `INSERT ... ON CONFLICT DO NOTHING RETURNING
"automationId"` actually returned, so a redelivered webhook or a BullMQ retry writes
nothing and counts nothing.

The column's percentage is measured against `repliesCount + missedCount` — the comments the
automation actually engaged with — **not** `sentCount`. A decline is not an attempt, and
`sentCount` counts attempts on one half of the comment only, so dividing by it would
compare two different populations. When `repliesCount` is 0 the rate would be a bare
"100%" that says nothing true (a Messenger automation replying publicly only counts no
replies by design), so the cell shows the count alone.

> **Write volume.** `findActiveAutomations` scopes by workspace + channel, **not** by post,
> so one comment is shown to every active automation on that channel and can produce up to
> `N-1` miss rows. A workspace running 50 automations over 2,000 comments/day writes
> ~100k rows/day. `processCommentAutomation` flushes them in **one** insert per comment to
> keep that to a single statement, and the rows are **never purged** — an explicit product
> decision, so the drill-down can always explain the counter. If that has to change,
> `purgeFailedCommentAutomationEvents` is the pattern to copy, and it will need its own
> partial index the way that one does.

### Click attribution travels in `metadata`, not on the anchor

**There are two independent button-payload encoders, and the click only sees one of them.**
`convertButtonsToTemplate` (`apps/worker/src/chat/handlers/send-flow-step.ts`) writes the
`Message` row's `contentAttributes` — what the inbox renders. The payload the contact actually
taps is encoded *again*, by each channel, because `sendFlowStep` hands the integration the RAW
step — `send-button.ts`, `send-quick-reply.ts` and (messenger only)
`send-messenger-template.ts` under
`integrations/{messenger,instagram,instagram-facebook}/src/handlers/message/outgoing-message/`.
Patching only the worker's copy leaves the column at zero forever.

So the automation id rides in `metadata` — a `commentAutomationMetadataPayload`
(`COMMENT_AUTOMATION_PAYLOAD_TYPE`) set on the `sendFlow` job by `executePublicReply` /
`executePrivateReply` — and every encoder reads it with
`extractMetadata("commentAutomationId", metadata)`, exactly as it already reads `broadcastId`.

`CommentAnchor.automationId` deliberately does **not** drive this, even though the anchor names
the same automation: it never reaches the encoders, it is withheld from `instagramFacebook` and
from non-message steps, and it is lost across a Wait. `metadata` survives all of that —
`ContactOnSmartDelay.metadata` is a real column — so a button on any step of the reply is
attributed, not just the first.

Three attribution caveats worth knowing:

- **A click names the automation, not the reply.** A Facebook comment id is
  `{storyId}_{commentId}` and the button payload carries bigints only, so
  `markClickedForAutomationContacts` lands the click on the newest unclicked row for the
  `(automationId, contactInboxId)` pair.
- **An "open website" button pointing at an external URL is never tracked**, for broadcast
  either: `appendCodeToMagicLink` only appends `?code=` to a magic link (`/r/{workspaceId}/{name}`).
  Use a magic link if the click has to count.
- **Instagram cannot track a magic-link click at all** — its encoder never calls
  `appendCodeToMagicLink` and passes no `contactInboxId`, which `/r/...` rejects with a 400.
  Pre-existing gap, unrelated to comment automation; postback buttons are unaffected.

## Tag tracking

`options.trackUserTags` backs two contact system fields, for campaigns that ask people to
tag their friends:

| Variable | Meaning |
|---|---|
| `{{total_tagged}}` | How many accounts the contact has tagged, summed over every counted comment |
| `{{total_new_tagged}}` | How many of those were not yet contacts in this inbox (never messaged the page, never in its contact list) |

Both are **lifetime running totals** stored on `Contact.totalTagged` / `Contact.totalNewTagged`
(integer, `DEFAULT 0`), read by `getSystemFieldValue` straight off the contact. They are
moved only by `contactService.incrementTagCounters` — a DB-side `col = col + n`, never
read-modify-write.

Counting happens **once per comment**, not once per automation, and **before** the reply
filters: if any active automation with the option on is within schedule and targets the
post, `trackCommentTags` (`comment-automation/index.ts`) runs before the loop. It stamps
`totalTagged`/`totalNewTagged` onto the comment message's `contentAttributes` first and then
increments the contact; a message that already carries the stamp is skipped. The job id is
`comment-auto-{commentId}`, so a retry runs after the first attempt, never beside it — and
stamping first means a crash between the two writes loses one comment's count rather than
doubling it. Running ahead of the filters is deliberate: "reply once per user per post" is
about replying and must not stop a repeat commenter's tags from being counted. It is still
`await`ed before any reply dispatches, so the reply renders the total including this
comment.

The resolver is `comment-automation/comment-tags.ts` (`createCommentTagResolvers`),
memoized per comment; the same mention list also answers the `mentions` "Reply to"
filter. **Only Facebook is exact:**

- **Facebook** reads `message_tags` off the `feed` webhook — real user ids, exact counts —
  and falls back to `GET /{comment-id}?fields=message_tags` when the webhook omitted the
  key. Known contacts are matched on `ContactInbox.sourceId`.
- **Instagram, Threads, TikTok** carry no tagged-user list anywhere (webhook or API).
  Mentions are parsed as `@handle` from the comment text (`extractInstagramMentions`) and
  matched against `ContactInbox.sourceUsername` — and, on Threads, also against
  `sourceId`, because Threads keys contacts by the lowercased username and never fills
  `sourceUsername` (`usernameIsSourceId`). TikTok's `sourceUsername` is lowercased on write
  for the same exact-match reason.

Two text-heuristic caveats follow, and both are expected behaviour:

1. A handle that belongs to no real account still counts as a tagged person — nothing is
   available to validate it against.
2. `{{total_new_tagged}}` over-counts for Instagram contacts whose `sourceUsername` is
   still null. The column is filled going forward from the comment webhook
   (`fromUsername`) and from `getUserProfile`; contacts last seen before that shipped are
   counted as new until they interact again. There is no safe backfill — IG contacts
   stored the handle in `firstName`, but `getUserProfile` overwrites it with the display
   name, so a row where `firstName` is still a handle cannot be told apart from one where
   it is a real name.

## Hide: GIF and emoji

`hasEmoji` is a regex on the comment text and works on every channel that can hide.
`hasGif` needs attachment data, which only two channels expose — the builder shows the
switch only there, and the service pins `hasGif` off on Instagram writes
(`commentAutomationChannelSupportsHideGif` in `@chatbotx.io/database/partials`):

| Channel | GIF source |
|---|---|
| messenger | `GET /{comment-id}?fields=attachment` → `attachment.type` starting with `animated_image` |
| threads | `GET /{reply-id}?fields=gif_url` (`getReplyGifUrl`) — a GIF reply is still `TEXT_POST` by `media_type`, and the reply webhook does not carry `gif_url` |
| instagram, instagramFacebook, tiktok | none — comment text only |

Threads hides via `POST /{reply-id}/manage_reply?hide=` (scope `threads_manage_replies`),
which Meta only allows on **top-level** replies. The worker therefore skips hiding a nested
Threads reply (`supportsHideForComment` in `hide-comments.ts`, logged as
`hide nested reply unsupported`) instead of enqueuing a state change that would mark it
hidden in the inbox and then fail at the channel.

## Known gaps & pitfalls

- **`parent_id` = `post_id` for top-level comments.** Never treat a truthy `parentId` as
  "reply." (Fixed via `isCommentReply`; regression here silently drops every top-level
  comment when `ignoreCommentReplies` is on.) Non-Meta channels need their raw parent
  normalized *before* that call — TikTok's `0` sentinel is the worked example above.
- **Post-id formats differ by picker tab.** Always compare via `normalizePostId`. Reels
  may still need verification that the stored `video_id` equals the webhook `story_id`.
- **Capabilities differ per channel.** Private DM replies work on the three Meta channels
  and, conditionally, on TikTok (`PRIVATE_REPLY_TEXT_SENDERS`); Threads has no DM API at
  all. Comment liking and hiding exist on the Meta channels and TikTok but not Threads.
  Among the Meta
  channels liking exists only on `messenger` and
  `instagramFacebook` — Instagram Login has no like API, so its `likeComment` handler
  is a logged no-op — and the attachment lookup behind `hideComments.hasImage` /
  `hasVideo` is implemented only for `messenger` (`comment-attachment.ts`
  short-circuits every other channel to "no attachment"). The `ig-comments` form gates
  each toggle separately: the like switch renders only for `instagramFacebook`, while
  `hasImage`/`hasVideo` are hidden for both Instagram variants. Keep that pattern —
  hide an unsupported toggle rather than rendering a dead one.
- **TikTok's private reply is conditional, and deferred because of it.**
  Comment-to-Message (`direct_reply` on `business/message/send/`) addresses the DM by
  `comment_id`, so no conversation has to exist first — but TikTok accepts only a comment
  its OWN classifier flagged as high intent, reported on the separate
  `im_receive_high_intent_comment` webhook. That event rides the `DIRECT_MESSAGE`
  subscription, not `COMMENT`, and needs the feature enabled per account via
  `business/message/direct_reply/update/` (Settings → Channels → TikTok). Because the two
  webhooks are independent and unordered, the flag is stamped onto the comment's own
  `Message.contentAttributes.tiktokHighIntent` (atomic `jsonb ||` via
  `mergeContentAttributesBySourceId`) and the automation pass reads it back:
  flagged → send inline; not flagged → enqueue `deferredCommentPrivateReply`, which
  re-checks at 45s/3min/10min and then records one `failed` event. The comment's single DM
  budget is claimed at DEFERRAL time, not at send time, or a second automation would queue
  a second deferral for the same budget. `flow` is rejected on this channel: TikTok grants
  one comment-anchored message and its `sendFlowStep` needs a `conversation_id` for every
  step after the first. The window is 48 hours, not Meta's 7 —
  `PRIVATE_REPLY_WINDOW_MS_BY_CHANNEL` is per channel and both the caller's gate and
  `executePrivateReply`'s defence-in-depth check must be passed the same `channelType`.
- **A channel whose public reply is not idempotent must never retry the automation job.**
  `SINGLE_ATTEMPT_COMMENT_AUTOMATION_CHANNELS` (`received-message.ts`) caps `threads` and
  `tiktok` at `attempts: 1`: Threads' `sendCommentReply` opens a fresh media container per
  call and TikTok's `business/comment/reply/create/` takes no client-side key, so a retry
  after a partial failure posts a SECOND visible reply with no id to resume from. It is an
  allowlist, so a new channel keeps the default retry policy — only add one there once you
  have checked the channel deduplicates the reply itself.
- **TikTok's `owner` flag is the only self-authorship check that channel has.**
  `receiveComment`'s `fromId === integrationIdentifier` guard cannot fire on TikTok: the
  webhook reports a `unique_identifier` while the integration is keyed by `open_id`. So
  when `resolveTiktokCommenterIdentity` cannot answer — the enrichment call failed, or the
  comment is absent from the response — the result means "authorship unknown", not
  "ordinary commenter". The comment is still ingested (a missing display name must not cost
  the inbox a comment) but the automation is withheld, because answering a comment that may
  be the business's own would have the account replying to itself on a channel whose reply
  no retry policy can retract.
- **An AI reply records its analytics event in two places.** The dispatcher opens the row
  with `replyText: null` (the text does not exist yet); `processCommentAIReply` settles it
  with the generated text, or marks it `failed` with the bail-out reason. Every
  `rollbackCommentDedup` in `ai-reply.ts` is paired with a settle through
  `abandonAIReply` — miss one and a silent non-reply shows on the analytics page as a
  success, which is exactly what the Error Logs panel exists to prevent.
- **A private flow reply must be enqueued on the DM conversation.** Reusing the
  comment-anchored `conversationId` strands the flow: the first message is delivered, the
  flow parks on the post conversation, and the contact's reply arrives on the DM
  conversation where no challenge exists. Nothing throws, no queue errors, no `sendError` —
  the routing simply falls through to `automatedResponse`. See
  [Which conversation a flow reply runs on](#which-conversation-a-flow-reply-runs-on).
- **Instagram comment replies are text-only.** `POST /{ig-comment-id}/replies` accepts
  nothing but `message`; there is no `attachment_url` (that is a Facebook Page comment
  feature, used by `integrations/messenger`). A media step in a *public* reply flow
  therefore cannot be delivered on either Instagram variant: `sendComment` throws
  `ChannelError(PAYLOAD_INVALID)` so the failure lands on the message row as a `sendError`
  the inbox shows. It used to `return { messageIds: [] }` with only a `logger.warn`, which
  made the step vanish while the inbox still displayed it. On Messenger the same step does
  post, carrying `attachments[0].url` as `attachment_url` — only the first attachment. To
  deliver media in answer to a comment, use a **private** reply: the comment_id-anchored Send
  API takes attachments and templates. (Corroborated by
  [openreply](https://github.com/diwenne/openreply), an Instagram-Login project whose
  `sendCommentReply` likewise posts only `{ message }`, and which routes everything richer
  through a `recipient: { comment_id }` button template.)
- **Everything in a public reply flow is public — including sub-flows.** The `public` anchor
  is never consumed, so every message step of the run posts under the post, and that includes
  steps reached through `startAnotherNode` / `startExternalFlow`. Do not point a public reply
  at a flow written for a 1-to-1 DM: discount codes, personal details and personalised links
  become publicly visible. Use `privateReply` for those.
- **A public reply flow still loses its anchor across a Wait step.** `ContactOnSmartDelay`
  has no column for `commentAnchor` and `buildSendFlowResumeJob` rebuilds the job from that
  row alone, so steps after a wait fall back to a DM send. Documented at `step.ts`'s
  `handleWait`; fixing it needs a schema change.
- **A `getUserData` prompt that is *not* plain text still loses the anchor.** The date /
  datetime webview prompt and the WhatsApp native location request go out through
  `sendChatMessage`, and `ChatJobSendChatMessage` has no `commentAnchor` field
  (`packages/worker-config/src/queues/chat/index.ts`) — only the plain-text prompt uses
  `enqueueFlowStepMessage`, which does. This does not reach Instagram, the channel where
  comment private replies matter most: `URL_QUICK_REPLY_CAPABLE_CHANNELS` excludes it, so
  an Instagram `getUserData` always falls through to the text prompt. Messenger is the
  exposed one. Extending that job type is a larger change.
- **`options.trackUserTags` outside Facebook is a text heuristic** — see
  [Tag tracking](#tag-tracking) for the two limitations that do not apply to Facebook.
- **`getPriorContactInboxCount` counts `ContactInbox` rows**, so a contact who DM'd via
  another inbox is treated as "not new."
- **Silent skips must log.** Every `continue` in the loop calls `logAutomationSkipped`. If
  you add a new filter, add a skip log too — otherwise production debugging is blind
  (`processCommentAutomation` returns `void`, so BullMQ always records `returnValue: null`
  regardless of what happened).
- **Instagram-via-Facebook private replies go through the Page node, never the IG node.**
  `sendPrivateReplyMessage`
  ([`integrations/instagram-facebook/src/apis/comment.ts`](../integrations/instagram-facebook/src/apis/comment.ts))
  must post to `/{pageId}/messages`. Meta exposes the `messages` edge only on the Page for
  this login type; `/{igId}/messages` is rejected with `(#3) Application does not have the
  capability to make this API call.` even when the app holds `instagram_manage_messages`,
  `pages_messaging` and Human Agent at **Advanced Access** — code 3 means "this edge does
  not exist here", not "permission missing", so chasing it in the App dashboard is a dead
  end. This has regressed twice ([#875](https://github.com/ChatbotXIO/ChatbotX/pull/875)
  moved it to `pageId`; [#945](https://github.com/ChatbotXIO/ChatbotX/pull/945) moved it
  back to satisfy a stale test whose fixture had no `pageId`, so the endpoint silently
  became `/undefined/messages`). The blast radius is every private reply on that channel —
  automation `text`, `AIAgent`, the first message of a `flow` reply, **and** the agent's
  manual private reply from the inbox, which enters through
  `handlers/comment/outgoing-private-reply` instead of the automation loop. The Instagram
  Login variant is different on purpose: it posts to `me/messages` on
  `graph.instagram.com`. `send-private-reply.test.ts` now pins the node and asserts the IG
  node is never called — do not "simplify" that away.
- **The two Instagram packages log under the same module name.** Both
  `integrations/instagram/src/lib/logger.ts` and
  `integrations/instagram-facebook/src/lib/logger.ts` call
  `getChildLogger("integration-instagram")`, so `module=integration-instagram` in
  production does **not** tell you which login type failed. Use the request host
  (`graph.facebook.com` = via Facebook, `graph.instagram.com` = Instagram Login) or the
  stack trace path instead.

## Testing

[`apps/worker/__tests__/comment-automation.test.ts`](../apps/worker/__tests__/comment-automation.test.ts)
covers: `isCommentReply`, reply filtering, `matchPost` normalization, the
`replyToUsersWhoCommentedOnOtherPosts` gate, AIAgent enqueue (public/private), the
`processCommentAIReply` delivery paths, per-channel private-reply routing (messenger /
instagram / instagramFacebook) and flow-reply comment anchors, and hide-keyword
case- and accent-insensitivity. Run:

```bash
pnpm --filter worker vitest run __tests__/comment-automation.test.ts
```
