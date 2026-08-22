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
| Tests | `apps/worker/__tests__/comment-automation.test.ts` |

## Data-flow in one line

`feed webhook (verb "add") / instagram comments webhook → incomingComment → receiveComment → processCommentAutomation → (AIAgent) commentAIReply`.

## The traps (read before editing)

1. **`parent_id` is ALWAYS present and equals `post_id` for top-level comments.** A truthy
   `parentId` does NOT mean "reply." Use `isCommentReply(parentId, postId)`
   (`parentId !== postId`). Breaking this + default `ignoreCommentReplies: true` silently
   drops every top-level comment.

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

7. **`options.trackUserTags` is a no-op** (defined, not implemented). Every other option
   (including `replyToUsersWhoCommentedOnOtherPosts`) IS enforced — see the option table in
   the docs.

## Adding a new filter option (recipe)

1. Add the field to `fbCommentOptionsSchema` (partials) + DB default in the schema file
   (`jsonb` default string).
2. If it needs a DB lookup, add a method to `fbCommentAutomationService` (reuse the dedup
   table + its index where possible; prefer `LIMIT 1` existence checks).
3. Add the guard inside the loop in `processCommentAutomation`, **with a
   `logAutomationSkipped(..., reason)` before `continue`**.
4. Surface the toggle in `apps/builder/src/features/fb-comments/components/fb-comment-form.tsx`
   and add i18n keys to `apps/builder/messages/en.json` + `vi.json`.
5. Extend `apps/worker/__tests__/comment-automation.test.ts`.

## Adding a new reply type (recipe)

1. Extend `fbCommentReplySchema.type` (partials).
2. Handle it in BOTH `executePublicReply` (`public-reply.ts`) and `executePrivateReply`
   (`private-reply.ts`). Public = message `type:"comment"` + `replyToCommentId` via
   `sendChannelMessage`; private = the channel's entry in `PRIVATE_REPLY_TEXT_SENDERS`, so
   a new type has to work for all three channels (messenger, instagram,
   instagramFacebook).
3. Update `willSendReply` so dedup/`repliesCount` only count when a reply is actually
   dispatchable (e.g. require `value`).
4. If it needs async work (like AIAgent), add a dedicated job in worker-config, a handler,
   and a `case` in `apps/worker/src/integration/worker.ts` (the `never` exhaustiveness
   guard forces this — type + dispatch + handler land together).

## Verify

```bash
pnpm --filter worker vitest run __tests__/comment-automation.test.ts
pnpm --filter worker check-types
pnpm lint
```

Production sanity after deploy: comment on (a) a normal post, (b) a reel, (c) a comment
with a bare-domain link + hide-link on, (d) an automation with reply = AI Agent — and
confirm each fires or logs a clear skip reason.
