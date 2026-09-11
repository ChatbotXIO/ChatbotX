---
name: fb-comment-automation
description: >-
  Work on Facebook/Messenger and Instagram comment automation — the feature that
  auto-replies to, likes, or hides comments on Facebook Page and Instagram posts. Use
  when changing the comment webhook path, the automation matching/filter logic, reply
  dispatch (text/flow/AI agent), hide rules, post targeting, or the fb-comments /
  ig-comments builder features. Read this BEFORE editing anything under
  comment-automation to avoid the silent-failure traps.
---

# Facebook & Instagram Comment Automation

Full reference: [`docs/fb-comment-automation.md`](../../../docs/fb-comment-automation.md).
Read it before non-trivial changes. This skill is the quick map + the traps.

## Where things live

| Concern | Path |
|---|---|
| Automation loop, filters, dispatch | `apps/worker/src/integration/handlers/comment-automation/index.ts` |
| AI-agent reply (generate + deliver) | `apps/worker/src/integration/handlers/comment-automation/ai-reply.ts` |
| Per-channel private DM dispatch | `apps/worker/src/integration/handlers/comment-automation/private-reply.ts` (`PRIVATE_REPLY_TEXT_SENDERS`) |
| Supported channels union | `apps/worker/src/integration/handlers/comment-automation/channel-type.ts` (`CommentAutomationChannelType`) |
| Attachment info (image/video for hide) | `apps/worker/src/integration/handlers/comment-automation/comment-attachment.ts` |
| Receive comment + enqueue automation | `apps/worker/src/integration/handlers/received-message.ts` (`receiveComment`) |
| Webhook parse + enqueue | `integrations/messenger/src/handlers/webhook.ts`, `integrations/instagram/src/handlers/webhook.ts`, `integrations/instagram-facebook/src/handlers/webhook.ts` |
| Webhook value schema | `integrations/messenger/src/schema.ts` (`messengerFeedCommentValueSchema`), `integrations/instagram{,-facebook}/src/schemas.ts` (`instagramCommentEventValueSchema`) |
| DB queries (match/dedup/schedule) | `packages/business/src/fb-comment-automation/service.ts` |
| Schema + option/reply Zod partials | `packages/database/src/schema/fb-comment-automation.ts`, `.../partials/fb-comment-automation.ts` |
| Dedup ledger | `packages/database/src/schema/fb-comment-automation-reply.ts` |
| Job types | `packages/worker-config/src/queues/integration/index.ts` |
| Builder feature (form, actions) | `apps/builder/src/features/fb-comments/` (Facebook), `apps/builder/src/features/ig-comments/` (Instagram) |
| Analytics event table | `packages/database/src/schema/fb-comment-automation-event.ts` |
| Analytics read/write service | `packages/analytics/src/services/comment-automation-analytics.service.ts` |
| Analytics dashboard | `packages/analytics-nextjs/src/components/comment-automation-analytics.tsx` |
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

2. **Post ids are composite `{pageId}_{storyId}`**; the picker stores 3 different formats
   (published/ads composite, reels bare id, manual free-text). Always compare through
   `normalizePostId` (trailing story id). Never `post.value.includes(rawPostId)`.

3. **Every skip must log.** The loop uses `logAutomationSkipped(..., reason)` before each
   `continue`. `processCommentAutomation` returns `void` → BullMQ always logs
   `returnValue: null`, so a skip with no log is undebuggable in production. Add a skip log
   for any new filter.

4. **AIAgent reply ≠ DM auto-responder.** `publicReply`/`privateReply` of type `AIAgent`
   store the **selected agent id** in `value`. Generation uses `generateAIReplyText`
   (tools + rich OFF, returns text only); the comment handler routes public → public
   comment reply (`type:"comment"` + `replyToCommentId`), private → DM. Do NOT route
   through `processAutomatedResponse` — it uses the workspace *default* agent and always
   sends a DM.

5. **Dedup ledger is dual-purpose.** `fbCommentAutomationReplyModel` rows
   (`automationId, contactId, postId`) are written after every successful reply and read by
   both `replyOncePerUserPerPost` (same post) and `replyToUsersWhoCommentedOnOtherPosts`
   (other post). The unique index `FBCommentAutomationReply_dedup_idx` already serves
   `(automationId, contactId)` + `postId != ?` queries — no new index needed; use a
   `LIMIT 1` existence check, not `$count`.

6. **Three channels, one loop.** `type` is `messenger` | `instagram` (Instagram Login) |
   `instagramFacebook` (Instagram via Facebook Login) — see
   `CommentAutomationChannelType` — and `findActiveAutomations` filters on it, so every
   capability must be routed per channel. Private DM text works on all three via
   `PRIVATE_REPLY_TEXT_SENDERS` (comment_id-anchored Send API); comment liking exists
   only on `messenger` + `instagramFacebook` (Instagram Login's `likeComment` is a logged
   no-op); the attachment lookup behind `hideComments.hasImage`/`hasVideo` is
   messenger-only. Hide an unsupported toggle in the builder form instead of shipping a
   dead switch.

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

8. **`options.trackUserTags` is a no-op** (defined, not implemented). Every other option
   (including `replyToUsersWhoCommentedOnOtherPosts`) IS enforced — see the option table in
   the docs.

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

## Adding a new filter option (recipe)

1. Add the field to `fbCommentOptionsSchema` (partials) + DB default in the schema file
   (`jsonb` default string).
2. If it needs a DB lookup, add a method to `fbCommentAutomationService` (reuse the dedup
   table + its index where possible; prefer `LIMIT 1` existence checks).
3. Add the guard inside the loop in `processCommentAutomation`, **with a
   `logAutomationSkipped(..., reason)` before `continue`**.
4. Surface the toggle in `apps/builder/src/features/fb-comments/components/fb-comment-form.tsx`
   and add i18n keys to **every** locale file in `apps/builder/messages/` (the i18n parity
   check in `pnpm lint` fails on a missing key in any of the 20 locales).
5. Extend `apps/worker/__tests__/comment-automation.test.ts`.

## Adding a new reply type (recipe)

1. Extend `fbCommentReplyTypes` (partials) — `fbCommentReplySchema.type` and the
   `commentAutomationReplyType` pgEnum on `FBCommentAutomationEvent` both derive from it,
   so a new value needs a database migration too.
2. Handle it in BOTH `executePublicReply` (`public-reply.ts`) and `executePrivateReply`
   (`private-reply.ts`). Public = message `type:"comment"` + `replyToCommentId` via
   `sendChannelMessage`; private = the channel's entry in `PRIVATE_REPLY_TEXT_SENDERS`, so
   a new type has to work for all three channels (messenger, instagram,
   instagramFacebook).
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
