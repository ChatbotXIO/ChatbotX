# Facebook & Instagram Comment Automation

This document describes the **comment automation** feature: how a comment on a Facebook
Page post or an Instagram post flows from the webhook to an automated reply, how each
config option is matched and enforced, and the non-obvious pitfalls that have caused
silent failures. It is the reference for anyone touching the comment-automation code.

> Scope: the three `CommentAutomationChannelType` values (`channel-type.ts`) —
> `messenger` (Facebook Pages), `instagram` (Instagram Login) and `instagramFacebook`
> (Instagram via Facebook Login). All three share one table, one worker loop and one set
> of filters; the per-channel capability differences are listed under
> [Known gaps](#known-gaps--pitfalls).

## Tables

| Table | File | Role |
|---|---|---|
| `fbCommentAutomationModel` | [`packages/database/src/schema/fb-comment-automation.ts`](../packages/database/src/schema/fb-comment-automation.ts) | One automation config per row: post targeting, keyword filters, public/private reply, hide rules, schedule, options. |
| `fbCommentAutomationReplyModel` | [`packages/database/src/schema/fb-comment-automation-reply.ts`](../packages/database/src/schema/fb-comment-automation-reply.ts) | Dedup ledger: one row per `(automationId, contactId, postId)` written after every successful reply. Unique index `FBCommentAutomationReply_dedup_idx`. |

Zod partials (option/reply/post/schedule shapes):
[`packages/database/src/partials/fb-comment-automation.ts`](../packages/database/src/partials/fb-comment-automation.ts).

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
| DB queries (match/dedup/schedule) | [`packages/business/src/fb-comment-automation/service.ts`](../packages/business/src/fb-comment-automation/service.ts) |
| Builder form + actions | [`apps/builder/src/features/fb-comments/`](../apps/builder/src/features/fb-comments/) (Facebook), [`apps/builder/src/features/ig-comments/`](../apps/builder/src/features/ig-comments/) (Instagram) |
| Job types | [`packages/worker-config/src/queues/integration/index.ts`](../packages/worker-config/src/queues/integration/index.ts) |

## Facebook ID formats (critical)

Facebook `feed` webhooks send composite ids. Getting these wrong is the #1 source of
silent failures:

| Field | Format | Example |
|---|---|---|
| `post_id` | `{pageId}_{storyId}` | `2094067177305463_2357494887629356` |
| `comment_id` | `{storyId}_{commentId}` | `2357494887629356_1544045903933592` |
| `parent_id` | **Always present.** For a **top-level** comment it equals `post_id`; only a **reply to another comment** carries that comment's id. | top-level → `2094067177305463_2357494887629356` |

- `parent_id` presence does **not** mean "this is a reply." Use
  `isCommentReply(parentId, postId)` (`index.ts`), which is true only when
  `parentId !== postId`.
- The post picker stores different formats per tab: **published/ads** store the composite
  `{pageId}_{postId}`; **reels** store a bare video id; **manual entry** is whatever the
  user pastes. `matchPost` normalizes both sides on the trailing story id
  (`normalizePostId`) so all three match the webhook `post_id`.
- **Instagram ids are not composite.** Its `comments` webhook carries a bare comment `id`
  and a bare `media.id` (used as `postId`), and the `ig-comments` picker stores those same
  bare media ids — `normalizePostId` is a no-op there.

## Config options — matching & enforcement

All matching happens in the automation loop in
[`comment-automation/index.ts`](../apps/worker/src/integration/handlers/comment-automation/index.ts).
Each filter that fails calls `logAutomationSkipped(..., reason)` (logged at `info`) and
`continue`s to the next automation — so a skipped comment always leaves a log line.

| Option / field | Meaning | Enforcement |
|---|---|---|
| `isActive` | Automation on/off | `findActiveAutomations` filters `isActive: true`. |
| `type` | `messenger` \| `instagram` \| `instagramFacebook` | `findActiveAutomations` filters `type === channelType`, which is the incoming `integrationType`. The builder writes it: `fb-comments` → `messenger`, `ig-comments` → the selected Instagram variant. |
| `startTime`/`endTime` | Daily active window (workspace tz) | `isWithinSchedule` — lexicographic `"HH:mm"` compare, handles overnight windows; null → always within. |
| `post` (`all` / `postIds`) | Which posts | `matchPost` — `all` always true; `postIds` matches via normalized trailing id. |
| `options.ignoreCommentReplies` (default **true**) | Skip replies-to-comments | Skips only when `isCommentReply(parentId, postId)` is true. |
| `includeKeywords` (`all`/`equal`/`contain`) | Text must match | `matchKeywords` — lowercased both sides. `equal` = whole comment equals a keyword; `contain` = substring. |
| `excludeKeywords` | Text must not contain | `matchKeywords` — substring, lowercased. |
| `options.replyToNewContactsOnly` | Only first-time contacts | `getPriorContactInboxCount(contactId) > 1` → skip. Counts `ContactInbox` rows. |
| `options.replyOncePerUserPerPost` | Once per user per post | `findDedup(automationId, contactId, postId)` exists → skip. |
| `options.replyToUsersWhoCommentedOnOtherPosts` (default **true**) | If off, only engage each user on their first post | When `false`, `hasRepliedOnOtherPost` (a dedup row with a different `postId`) → skip. |
| `options.likeUserComment` | Auto-like the comment | Runs only if the incoming comment's DB message was found (`findBySourceId`). |
| `hideComments.*` | Auto-hide matching comments | `applyHideComments` — `all`, `hasPhoneNumber` (PHONE_RE), `hasLink` (LINK_RE, matches bare domains too), `hasKeywords` (case-insensitive), `hasImage`/`hasVideo`. |
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
| `text` | the text | Posts a public comment reply: message `type: "comment"` + `contentAttributes.replyToCommentId`, enqueued as `sendChannelMessage`. | `PRIVATE_REPLY_TEXT_SENDERS[channelType]` (`private-reply.ts`) → the channel's comment_id-anchored Send API DM. |
| `flow` | flow id | Enqueues `sendFlow` with `flowId` and a `public` `commentAnchor`, so the flow's first step is posted as a comment reply. | Same job with a `private` anchor: the flow's **first** message is sent through the comment_id-anchored Send API (comment window, not the 24-hour messaging window); later messages take the normal window-gated path. |
| `AIAgent` | **AI agent id** | Enqueues a delayed `commentAIReply` job → `processCommentAIReply` generates text with the **selected** agent (`generateAIReplyText`, tools/rich off) and posts it as a **public comment reply**. | Same job, `replyChannel: "private"` → generated text sent as a **DM**. |

The `AIAgent` path deliberately does **not** reuse the DM auto-responder pipeline
(`processAutomatedResponse`), because that pipeline always uses the workspace *default*
agent and always sends a DM. `generateAIReplyText` generates text only (no tools, no
send), and the comment handler owns the channel routing.

## Known gaps & pitfalls

- **`parent_id` = `post_id` for top-level comments.** Never treat a truthy `parentId` as
  "reply." (Fixed via `isCommentReply`; regression here silently drops every top-level
  comment when `ignoreCommentReplies` is on.)
- **Post-id formats differ by picker tab.** Always compare via `normalizePostId`. Reels
  may still need verification that the stored `video_id` equals the webhook `story_id`.
- **Capabilities differ per channel.** Private DM replies work on all three channels
  (`PRIVATE_REPLY_TEXT_SENDERS`), but comment liking exists only on `messenger` and
  `instagramFacebook` — Instagram Login has no like API, so its `likeComment` handler
  is a logged no-op — and the attachment lookup behind `hideComments.hasImage` /
  `hasVideo` is implemented only for `messenger` (`comment-attachment.ts`
  short-circuits every other channel to "no attachment"). The `ig-comments` form gates
  each toggle separately: the like switch renders only for `instagramFacebook`, while
  `hasImage`/`hasVideo` are hidden for both Instagram variants. Keep that pattern —
  hide an unsupported toggle rather than rendering a dead one.
- **`options.trackUserTags` is defined but not implemented** — the toggle has no effect.
- **`getPriorContactInboxCount` counts `ContactInbox` rows**, so a contact who DM'd via
  another inbox is treated as "not new."
- **Silent skips must log.** Every `continue` in the loop calls `logAutomationSkipped`. If
  you add a new filter, add a skip log too — otherwise production debugging is blind
  (`processCommentAutomation` returns `void`, so BullMQ always records `returnValue: null`
  regardless of what happened).

## Testing

[`apps/worker/__tests__/comment-automation.test.ts`](../apps/worker/__tests__/comment-automation.test.ts)
covers: `isCommentReply`, reply filtering, `matchPost` normalization, the
`replyToUsersWhoCommentedOnOtherPosts` gate, AIAgent enqueue (public/private), the
`processCommentAIReply` delivery paths, per-channel private-reply routing (messenger /
instagram / instagramFacebook) and flow-reply comment anchors, and hide-keyword
case-insensitivity. Run:

```bash
pnpm --filter worker vitest run __tests__/comment-automation.test.ts
```
