---
name: comment-automation
description: >-
  Work on Facebook/Messenger and Instagram comment automation — the feature that
  auto-replies to, likes, or hides comments on Facebook Page and Instagram posts. Use
  when changing the comment webhook path, the automation matching/filter logic, reply
  dispatch (text/flow/AI agent), hide rules, post targeting, or the fb-comments /
  ig-comments builder features. Read this BEFORE editing anything under
  comment-automation to avoid the silent-failure traps.
---

# Facebook & Instagram Comment Automation

Full reference: [`docs/comment-automation.md`](../../../docs/comment-automation.md).
Read it before non-trivial changes. This skill is the quick map + the traps.

## Where things live

| Concern | Path |
|---|---|
| Automation loop, filters, dispatch | `apps/worker/src/integration/handlers/comment-automation/index.ts` |
| AI-agent reply (generate + deliver) | `apps/worker/src/integration/handlers/comment-automation/ai-reply.ts` |
| Per-channel private DM dispatch | `apps/worker/src/integration/handlers/comment-automation/private-reply.ts` (`PRIVATE_REPLY_TEXT_SENDERS`) |
| Supported channels union | `apps/worker/src/integration/handlers/comment-automation/channel-type.ts` (`CommentAutomationChannelType`) |
| Private-reply capability (counter side) | `packages/database/src/partials/comment-automation.ts` (`commentAutomationChannelSupportsPrivateReply`) — mirrors `PRIVATE_REPLY_TEXT_SENDERS`, see trap 11 |
| Attachment info (image/video for hide) | `apps/worker/src/integration/handlers/comment-automation/comment-attachment.ts` |
| Receive comment + enqueue automation | `apps/worker/src/integration/handlers/received-message.ts` (`receiveComment`) |
| Webhook parse + enqueue | `integrations/messenger/src/handlers/webhook.ts`, `integrations/instagram/src/handlers/webhook.ts`, `integrations/instagram-facebook/src/handlers/webhook.ts` |
| Webhook value schema | `integrations/messenger/src/schema.ts` (`messengerFeedCommentValueSchema`), `integrations/instagram{,-facebook}/src/schemas.ts` (`instagramCommentEventValueSchema`) |
| DB queries (match/dedup/schedule) | `packages/business/src/comment-automation/service.ts` |
| Schema + option/reply Zod partials | `packages/database/src/schema/comment-automation.ts`, `.../partials/comment-automation.ts` |
| Dedup ledger | `packages/database/src/schema/comment-automation-reply.ts` |
| Job types | `packages/worker-config/src/queues/integration/index.ts` |
| Builder feature (form, actions) | `apps/builder/src/features/fb-comments/` (Facebook), `apps/builder/src/features/ig-comments/` (Instagram) |
| Analytics event table | `packages/database/src/schema/comment-automation-event.ts` |
| Analytics read/write service | `packages/analytics/src/services/comment-automation-analytics.service.ts` |
| Analytics dashboard | `packages/analytics-nextjs/src/components/comment-automation-analytics.tsx` |
| Delivery-stat columns + dialog | `apps/builder/src/features/shared/comment-automation/comment-automation-stat-{columns,cell}.tsx`, `comment-automation-contacts-dialog.tsx` |
| Miss (declined comment) table | `packages/database/src/schema/comment-automation-miss.ts`, `.../partials/comment-automation-miss.ts` |
| Miss read/write | `packages/analytics/src/repositories/postgres/comment-automation-miss.repository.ts`, `commentAutomationAnalyticsService.recordMisses` |
| Cross-queue delivery/failure anchor | `apps/worker/src/lib/comment-automation-anchor.ts` |
| Tests | `apps/worker/__tests__/comment-automation.test.ts` |

## Data-flow in one line

`feed webhook (verb "add") / instagram comments webhook → incomingComment → receiveComment → processCommentAutomation → (AIAgent) commentAIReply`.

## The traps (read before editing)

1. **`parent_id` is ALWAYS present, but it does NOT always equal `post_id` on a top-level
   comment.** A truthy `parentId` does not mean "reply", and neither does
   `parentId !== postId` — Facebook varies the composite per post type. A reel sends
   `parent_id` byte-identical to `post_id`; a **photo post sends `{albumId}_{storyId}`**,
   where only the trailing story id agrees. Use
   `isCommentReply(parentId, postId, commentId)`, which compares the **trailing** ids via
   `normalizePostId`. Testing the raw strings + default `ignoreCommentReplies: true`
   silently drops every top-level comment on a photo post. A reply is still safe to spot
   because `comment_id` stays anchored to the story (`{storyId}_{replyId}`) even for a
   reply, so it can never collide with its own `parent_id`'s trailing half.

   **`isCommentReply` is that Meta heuristic and nothing more — normalize a non-Meta
   parent at the channel boundary first.** Against bare ids it degenerates to "a parent
   that is neither the post nor the comment means reply", and TikTok sends
   `parent_comment_id: 0` (a sentinel, arriving as the string `"0"`) on a **top-level**
   comment — which swallowed every TikTok automation behind a `commentIsReply` miss.
   `resolveParentCommentId` (`integrations/tiktok/src/handlers/webhook.ts`) resolves it
   from the payload's own `comment_type` discriminator before the job is enqueued. A new
   channel gets the same treatment in its own webhook handler; never widen the shared
   matcher with per-channel sentinels.

2. **Post ids are composite `{pageId}_{storyId}`**; the picker stores 3 different formats
   (published/ads composite, reels bare id, manual free-text). Always compare through
   `normalizePostId` (trailing story id). Never `post.value.includes(rawPostId)`.

3. **Every skip must log AND record a miss.** The loop uses
   `logAutomationSkipped(..., reason)` before each `continue`, immediately followed by
   `collectMiss(automation.id, <reason>)`. `processCommentAutomation` returns `void` →
   BullMQ always logs `returnValue: null`, so a skip with no log is undebuggable in
   production; and a skip with no `collectMiss` is a filter whose declines the **Misses**
   column silently never counts — no compile error, the number is just quietly too low. A
   new filter therefore needs three things landed together: the guard, a new value in
   `commentAutomationMissReasons`
   (`packages/database/src/partials/comment-automation-miss.ts`, which needs a migration
   for the pgEnum), and a case in the `gateCases` table in
   `apps/worker/__tests__/comment-automation.test.ts`. Misses go to their OWN table
   (`CommentAutomationMiss`), never `CommentAutomationEvent` — see trap 16.

4. **AIAgent reply ≠ DM auto-responder.** `publicReply`/`privateReply` of type `AIAgent`
   store the **selected agent id** in `value`. Generation uses `generateAIReplyText`
   (tools + rich OFF, returns text only); the comment handler routes public → public
   comment reply (`type:"comment"` + `replyToCommentId`), private → DM. Do NOT route
   through `processAutomatedResponse` — it uses the workspace *default* agent and always
   sends a DM.

5. **Dedup ledger is dual-purpose.** `commentAutomationReplyModel` rows
   (`automationId, contactId, postId`) are written after every successful reply and read by
   both `replyOncePerUserPerPost` (same post) and `replyToUsersWhoCommentedOnOtherPosts`
   (other post). The unique index `CommentAutomationReply_dedup_idx` already serves
   `(automationId, contactId)` + `postId != ?` queries — no new index needed; use a
   `LIMIT 1` existence check, not `$count`.

6. **Five channels, one loop.** `type` is `messenger` | `instagram` (Instagram Login) |
   `instagramFacebook` (Instagram via Facebook Login) | `threads` | `tiktok` — see
   `CommentAutomationChannelType` — and `findActiveAutomations` filters on it, so every
   capability must be routed per channel. No capability is universal any more, so read
   the gate rather than assuming:

   | | messenger | instagram | instagramFacebook | threads | tiktok |
   |---|---|---|---|---|---|
   | public reply | ✅ | ✅ | ✅ | ✅ | ✅ |
   | private DM reply (`PRIVATE_REPLY_TEXT_SENDERS`) | ✅ | ✅ | ✅ | ❌ | ⚠️ |
   | like (`supportsCommentLike`) | ✅ | ✅ | ✅ | ❌ | ✅ |
   | hide (`supportsHideComments`) | ✅ | ✅ | ✅ | ✅ | ✅ |
   | attachment lookup (`hasImage`/`hasVideo`) | ✅ | ❌ | ❌ | ❌ | ❌ |
   | GIF hide (`commentAutomationChannelSupportsHideGif`) | ✅ | ❌ | ❌ | ✅ | ❌ |
   | tag tracking / `mentions` filter | ✅ exact | ✅ text | ✅ text | ✅ text | ✅ text |

   Threads has no DM API at all; it hides only TOP-LEVEL replies (`manage_reply` — the worker
   skips nested ones via `supportsHideForComment`) and
   answers `hasGif` from the reply's `gif_url`. TikTok's ⚠️ is **conditional**, not partial: through
   Comment-to-Message it CAN answer a comment with a DM addressed by `comment_id` alone,
   but only for comments TikTok's own classifier flagged as high intent (the
   `im_receive_high_intent_comment` webhook, which rides the `DIRECT_MESSAGE`
   subscription and needs the feature enabled per account). Dispatch is therefore
   deferred, not immediate — see `privateReplyRequiresHighIntent` and
   `deferred-private-reply.ts`. TikTok also rejects `flow` there (one comment-anchored
   message per comment; later steps have no `conversation_id`) and its window is 48
   hours, not Meta's 7 — `PRIVATE_REPLY_WINDOW_MS_BY_CHANNEL`. Hide an unsupported toggle
   in the builder form instead of shipping a dead switch.

7. **A `private` flow reply runs on the DM conversation; a `public` one does not.** The
   comment conversation is anchored to the post (`sourceId = postId`), but DM replies land
   on the DM conversation (`sourceId IS NULL`). Enqueue `sendFlow` with the comment
   conversation and the flow parks where no reply can reach it — first message delivers,
   then the flow stalls at its first waiting step with **no error anywhere** (no throw, no
   queue error, no `sendError`; `resolveIncomingTextRouting` just finds no challenge and
   falls through to `automatedResponse`). Private uses
   `resolveDirectMessageConversationId`; public deliberately keeps `ctx.conversationId`,
   because the contact's next comment resolves back to that same conversation. Never
   "unify" the two branches. `commentAnchor` is orthogonal — it decides *delivery*: a
   `private` anchor is one-shot (Meta allows one comment_id-anchored DM per comment, so the
   first message-producing step claims it), a `public` one is never consumed and every step
   of the run posts as a comment reply. A claimed private anchor is **not dropped** — it
   rides on as `spent: true` so each channel's `sendFlowStep` can tell a comment-triggered
   follow-up from a plain flow message and gate it on `contact.lastIncomingMessageAt` via
   `assertCommentPrivateReplyFollowUpDeliverable` (`@chatbotx.io/sdk`): inside the 24h
   window it sends as a normal DM, outside it throws
   `comment_private_reply_already_used` → visible `sendError`. Never "restore" the drop;
   that turns the failure back into a Send API rejection swallowed by `sendFlowStep`.
   **"Message-producing step" is `STEP_PRODUCES_MESSAGE` (`flow-utils.ts`), an exhaustive
   `Record<StepType, boolean>` — a new step type does not compile until it is classified.**
   It is NOT "whatever is mapped to `sendFlowMessage`"; that definition silently excluded
   every step that sends from its own handler. `getUserData` was missing for exactly that
   reason, which broke the most natural shape of the feature, comment → DM that asks a
   question: question-first claimed nothing (the one anchored DM went unused, the prompt
   was rejected as an out-of-window DM), and a question after a `sendText` arrived with no
   anchor so the guard above never ran. Both fail *silently* — the challenge is written
   before the send and `sendFlowStep`'s catch swallows the error, so the step still returns
   `wait` and the answer is still captured; only the question never arrives.

   `true` means the step both RECEIVES and may CLAIM the anchor, so a step that sends but
   **cannot carry** the anchor stays `false`: claiming without forwarding burns the
   comment's one anchored DM on a send that never used it. `appointmentScheduling` and
   `questionnaires` are `false` today for that reason — like `getUserData`'s date/datetime
   webview and WhatsApp location prompts, they send through `sendChatMessage`, whose job
   type has no `commentAnchor` field and whose channel path (`sendMessageToChannel`) never
   reads one. Closing that needs the field plus anchor handling in each Meta channel's
   outgoing `sendMessage`; Instagram is unaffected either way
   (`URL_QUICK_REPLY_CAPABLE_CHANNELS` excludes it), Messenger is the exposed one.

   The claim is made **after** the handler returns and never on an `error` result — see
   `executeMultipleStepsGenerator`. Claiming up front burned the anchor on a step that sent
   nothing, because a handler can fail before its send and `getUserData` declares only
   `[success, skip]`, so an error does not branch and the run continues to the next step.

8. **`options.trackUserTags` is the one option that is not a filter, and its totals are
   lifetime, per contact.** It never skips — it adds the comment's counts to
   `Contact.totalTagged`/`totalNewTagged` (`contactService.incrementTagCounters`, an atomic
   `col + n`), which is what `{{total_tagged}}`/`{{total_new_tagged}}` read. Two rules
   keep the totals honest: (a) it runs **once per comment, before the loop** — never
   inside it, or two automations with the option on double-count, and never after the
   reply filters, or "reply once per user per post" stops a repeat commenter being
   counted; (b) the comment message's `contentAttributes` is stamped **before** the
   contact is incremented and a stamped message is skipped — that stamp is the only
   thing making a BullMQ retry a no-op. Keep it `await`ed before the reply dispatches.
   Facebook resolves tags to real user ids (`message_tags`, Graph fallback) and matches
   `ContactInbox.sourceId`; **Instagram, Threads and TikTok have no tagged-user data at
   all**, so `@handle` is regexed out of the text and matched against
   `sourceUsername` (plus `sourceId` on Threads, which keys contacts by username). Don't
   "fix" those by looking for a structured field; it does not exist. The same mention
   list backs the `includeKeywords.type: "mentions"` filter (exact count, 1–5). See
   `comment-tags.ts` and the docs' Tag tracking section.

9. **Instagram comment replies carry text only.** `POST /{ig-comment-id}/replies` has no
   `attachment_url` — that is Facebook-Page-only (`integrations/messenger`). Both Instagram
   variants' `sendComment` throw `ChannelError(PAYLOAD_INVALID)` when the message has
   attachments, so a media step of a public reply flow surfaces a `sendError` in the inbox
   instead of disappearing behind a `logger.warn`. Never "fix" that back into an empty
   `{ messageIds: [] }` return.

10. **Instagram-via-Facebook private replies use the Page node, not the IG node.**
    `sendPrivateReplyMessage` (`integrations/instagram-facebook/src/apis/comment.ts`) must
    post to `/{pageId}/messages`. `/{igId}/messages` returns `(#3) Application does not
    have the capability to make this API call.` even with `instagram_manage_messages`,
    `pages_messaging` and Human Agent at Advanced Access — code 3 means "this edge does
    not exist on this node", so it is NOT an App-dashboard problem. Already regressed
    twice (#875 fixed it, #945 reverted it to green a stale test whose fixture had no
    `pageId`, making the URL `/undefined/messages`). It breaks every private reply on the
    channel: `text`, `AIAgent`, a `flow` reply's first message, and the agent's manual
    inbox private reply (which enters via `handlers/comment/outgoing-private-reply`, not
    the automation loop). Instagram Login is different on purpose — `me/messages` on
    `graph.instagram.com`. Keep the `send-private-reply.test.ts` guard that asserts the IG
    node is never called. Also note both Instagram packages log
    `module=integration-instagram`, so attribute production failures by request host, not
    module name.

11. **The list columns read counters, the dialog reads events — never swap them.** The
    Sent/Delivered/Seen/Clicked/Failed columns come from lifetime `*Count` columns on
    `CommentAutomation`, NOT from aggregating `CommentAutomationEvent` the way
    broadcast aggregates `ContactOnBroadcast`: a nightly cron purges the FAILED event rows
    after `COMMENT_AUTOMATION_ERROR_RETENTION_DAYS` (successful rows are kept for the life
    of the automation), so an aggregate would shrink `failedCount` every night. What
    keeps the counters exact is that every increment counts the rows a conditional
    `UPDATE ... WHERE "<col>At" IS NULL RETURNING "automationId"` actually returned — a
    redelivered webhook or a BullMQ retry returns nothing and moves nothing. If you add
    an outcome, add BOTH the timestamp column (for the drill-down and the guard) and the
    counter, and drive the counter off the returned rows. Never increment on a call count.

    **Which half of the comment they count is a CHANNEL property, decided in one place.**
    `countsTowardStats` counts the DM where the channel has a comment-anchored one and the
    **public comment reply** where it does not (Threads) — `repliesCount` in the
    loop follows the same rule via `supportsPrivateReply`. TikTok counts the DM: it moved
    into the DM group when Comment-to-Message shipped, so a TikTok automation with no
    private branch now reads zero across the row. It is never the
    automation's *config*: a Messenger automation with no private branch still reads zero,
    deliberately. Three consequences. (a) The capability is duplicated on purpose —
    `PRIVATE_REPLY_TEXT_SENDERS` (worker, dispatch) and
    `commentAutomationChannelSupportsPrivateReply` (`packages/database/src/partials`,
    counters), because `packages/analytics` cannot import the Meta integrations; the
    parity test in `comment-automation.test.ts` is what stops them drifting. (b) Seen and
    Clicked cannot exist on a public reply, so `buildCommentAutomationStatColumns({
    supportsPrivateReply: false })` hides those two rather than showing `----` forever.
    (c) `getContacts`/`getContactIdsPage` take the one `replyChannel` their counter came
    from, so "select all" can never tag people the column did not count.

12. **A multi-step `flow` reply is ONE reply — its steps can settle in either order.**
    `sendFlowStep` swallows a step's error and runs the next one, so one event row can
    take several outcomes. Any step through means delivered and NOT failed, whichever way
    round they land: `settleEvent` refuses to fail an already-delivered row, and
    `markDelivered` clears an earlier `failedAt` and reports `clearedFailure` so the
    service takes `failedCount` back down. Only every step failing counts as a failure.
    Remove either half and a 3-step reply reports delivered + failed for the same reply,
    pushing the column percentages (measured against attempts) past 100%.

13. **Two independent button-payload encoders — patching the worker's is NOT enough.**
    `convertButtonsToTemplate` (`apps/worker/src/chat/handlers/send-flow-step.ts`) only writes
    the `Message` row's `contentAttributes`. The payload the contact actually TAPS is encoded
    again by each channel, because `sendFlowStep` hands the integration the raw step. Grep
    `encodeButtonPayload` under `integrations/{messenger,instagram,instagram-facebook}/src`
    and mirror EVERY hit on a flow-send path — messenger alone has three
    (`send-button.ts`, `send-quick-reply.ts`, `send-messenger-template.ts`), and
    `send-carousel.ts` only looks absent because it shares `getButtonTemplate`. The two hits
    that are correctly excluded are `messenger-ads-json.ts` and `lib/persistent-menu.ts`,
    neither of which sends a flow reply. Attribution added to only one side compiles, passes
    the worker tests, renders correctly in the inbox — and the click still reports nothing.
    The carrier is **`metadata`** (`COMMENT_AUTOMATION_PAYLOAD_TYPE`, read with
    `extractMetadata("commentAutomationId", metadata)`), never `CommentAnchor.automationId`:
    the anchor never reaches the encoders, is withheld from `instagramFacebook` and from
    non-message steps, and is lost across a Wait, while `metadata` survives all three
    (`ContactOnSmartDelay.metadata` is a real column). Node-level quick replies are the one
    exception — they already ship the canonical postback via `getCanonicalReplyPayload`.
    The guard tests are `integrations/*/__tests__/comment-automation-button-payload.test.ts`.

14. **Delivery is settled at each send site, not on the event bus.** There are four, and a
    new reply type needs whichever apply: `send-message.ts` (public text/AI, via the
    `contentAttributes.commentAutomation` anchor), `send-flow-step.ts` (both flow
    branches, same anchor), `executePrivateReply` and `processCommentAIReply` (private,
    sent inline through the Send API and leaving no `Message` row for a webhook to match).
    Only **Seen** and **Clicked** ride the bus, because only they arrive later and name
    something other than the reply. A `flow` reply carries its automation in
    `CommentAnchor.automationId` — that is also what puts the id into
    `encodeButtonPayload`'s 7th field so clicks can be attributed at all.

15. **Retention is per OUTCOME, and the analytics date filter is unbounded because of it.**
    `purgeFailedCommentAutomationEvents` deletes `status = 'failed'` rows only, after
    `COMMENT_AUTOMATION_ERROR_RETENTION_DAYS`; a successful row lives as long as the
    automation, which is what lets the filter offer `lifeTime`. Two things follow. (a) A
    new query that must survive the purge cannot read failed rows — and any new purge
    predicate needs its own partial index, the way
    `CommentAutomationEvent_failed_createdAt_idx` keeps the oldest-first chunk scan off
    the kept rows. (b) An unbounded range means the replies series is bucketed by MONTH
    past 60 days: the query and the zero-fill both take the width from
    `resolveRangeGranularity`, so changing one without the other yields one real point
    followed by a run of zeroes. Monthly keys stay `YYYY-MM-01` so the client parses them
    like daily ones — and the client parses a `YYYY-MM-DD` key as a LOCAL day (the server
    already resolved it in the viewer's timezone); `new Date(key)` reads it as UTC midnight
    and renders the previous month west of Greenwich.

14. **A `text` public reply is a LIST, and it is still ONE reply.** `publicReply.values` holds up
    to `COMMENT_REPLY_MAX_TEXTS` messages, each posted as its own comment reply. Never read
    `reply.value` directly — `resolveReplyTexts` is the only thing that knows the fallback to the
    legacy single-string shape, and `willSendReply` reads through it too; disagreeing there makes
    an automation go silent with no skip log. Write through `normalizeReplyTexts` so `value` and
    `values` cannot drift (a caller PATCHing only `value` on a row that has `values` is otherwise
    ignored without a word). Bookkeeping treats the set as ONE reply — one analytics event,
    `repliesCount` +1 — because `CommentAutomationEvent` is unique on
    `(automationId, commentId, replyChannel)` and every settle helper names a row by that triple.
    Sends are staggered by `PUBLIC_REPLY_SPACING_MS`; equal delays let the chat queue's
    `concurrency: 5` reorder them under the comment. Private reply stays single-message on
    purpose. In the form, the editor rows MUST be keyed by `field.id` — see trap 15.

15. **`TiptapEditorField` inside a `useFieldArray` must be keyed by `field.id`.** It snapshots its
    content once in a `useEffect` keyed on the form path. Removing an entry shifts the later ones
    but leaves the path at a given position unchanged, so an index key shows the removed entry's
    text — no error, just wrong content saved over the user's. See
    `features/shared/comment-automation/reply-texts-field.tsx`.

16. **A declined comment goes to `CommentAutomationMiss`, never to the event table.**
    `CommentAutomationEvent` only ever holds work the automation *attempted*: it is unique
    on `(automationId, commentId, replyChannel)` with `replyChannel`/`replyType` `NOT NULL`,
    and a decline has neither; every analytics-page query aggregates it directly, so a row
    type none of them want would have to be excluded from each one forever; and misses
    outnumber replies by however many automations the workspace runs
    (`findActiveAutomations` scopes by workspace + channel, **not** by post, so ONE comment
    is shown to every active automation on the channel). Three consequences. (a) The whole
    run's declines are flushed in **one** `recordMisses` call after the loop — never one
    insert per automation, or a busy Page fires N statements per comment. (b) `missedCount`
    is driven off the rows `INSERT ... ON CONFLICT DO NOTHING RETURNING` actually returned,
    exactly like the delivery counters, so a retry counts nothing. (c) These rows are
    **never purged**, by product decision — do not add a retention cron without asking, and
    if one is ever added it needs its own partial index the way
    `CommentAutomationEvent_failed_createdAt_idx` does. The percentage on the column
    divides by `repliesCount + missedCount`, NOT `sentCount`: a decline is not an attempt,
    and `sentCount` counts attempts on one half of the comment only (trap 11). A blocked
    private reply stays a `failed` event — it was attempted. `missedCount` itself is
    channel-agnostic, unlike the delivery counters — a decline has no reply channel.

## Adding a new filter option (recipe)

1. Add the field to `commentOptionsSchema` (partials) + DB default in the schema file
   (`jsonb` default string).
2. If it needs a DB lookup, add a method to `commentAutomationService` (reuse the dedup
   table + its index where possible; prefer `LIMIT 1` existence checks).
3. Add the guard inside the loop in `processCommentAutomation`, **with a
   `logAutomationSkipped(..., reason)` AND a `collectMiss(automation.id, <reason>)` before
   `continue`** — plus the new value in `commentAutomationMissReasons` (pgEnum → migration).
4. Surface the toggle in `apps/builder/src/features/fb-comments/components/fb-comment-form.tsx`
   and add i18n keys to **every** locale file in `apps/builder/messages/` (the i18n parity
   check in `pnpm lint` fails on a missing key in any of the 20 locales).
5. Extend `apps/worker/__tests__/comment-automation.test.ts` — including a row in the
   `gateCases` table under `describe("processCommentAutomation misses")`.

## Adding a new reply type (recipe)

1. Extend `commentReplyTypes` (partials) — `commentReplySchema.type` and the
   `commentAutomationReplyType` pgEnum on `CommentAutomationEvent` both derive from it,
   so a new value needs a database migration too.
2. Handle it in BOTH `executePublicReply` (`public-reply.ts`) and `executePrivateReply`
   (`private-reply.ts`). Public = message `type:"comment"` + `replyToCommentId` via
   `sendChannelMessage`; private = the channel's entry in `PRIVATE_REPLY_TEXT_SENDERS`, so
   a new type has to work for every channel whose entry in that map is non-null
   (messenger, instagram, instagramFacebook).
3. Update `willSendReply` so dedup/`repliesCount` only count when a reply is actually
   dispatchable (e.g. require `value`).
4. Return a `CommentReplyOutcome` (`reply-outcome.ts`) with the text the customer will
   actually see — that is what the analytics "Bot replies to comments" table groups on.
   Returning `null` still means "declined to send", exactly as the old boolean `false` did.
5. If it needs async work (like AIAgent), add a dedicated job in worker-config, a handler,
   and a `case` in `apps/worker/src/integration/worker.ts` (the `never` exhaustiveness
   guard forces this — type + dispatch + handler land together).

9. **An async reply type records its analytics event in TWO places.** `text` and `flow`
   are settled by the dispatcher in `index.ts` the moment they return an outcome, but
   `AIAgent` cannot be — its text does not exist yet. So `executePublicReply` /
   `executePrivateReply` open the row with `replyText: null`, and
   `processCommentAIReply` (`ai-reply.ts`) calls
   `commentAutomationAnalyticsService.settleEvent` to land the generated text, or a
   `failed` row carrying the bail-out reason. Every `rollbackCommentDedup` in that file is
   paired with a settle via `abandonAIReply` — miss one and the analytics page reports a
   silent non-reply as a success. Any new async reply type has to do the same on both
   sides.

## Verify

```bash
pnpm --filter worker vitest run __tests__/comment-automation.test.ts
pnpm --filter worker check-types
pnpm lint
```

Production sanity after deploy: comment on (a) a normal post, (b) a reel, (c) a comment
with a bare-domain link + hide-link on, (d) an automation with reply = AI Agent — and
confirm each fires or logs a clear skip reason.
