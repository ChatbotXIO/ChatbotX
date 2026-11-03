---
name: comment-automation
description: >-
  Work on comment automation across Messenger/Facebook Pages, Instagram (Login and via
  Facebook), Threads and TikTok — auto-replying to, liking, or hiding comments on posts
  and lives. Use when changing the comment webhook path, automation matching/filter
  logic, reply dispatch (text/flow/AI agent, public or private DM), hide rules, post
  targeting, delivery/miss analytics, or the fb-comments / ig-comments / threads-comments
  / tiktok-comments builder features. Read this BEFORE editing anything under
  comment-automation to avoid the silent-failure traps.
---

# Comment Automation (Messenger, Instagram, Threads, TikTok)

Full reference: [`docs/comment-automation.md`](../../../docs/comment-automation.md). Read it
before non-trivial changes. This skill is the quick map + the traps.

## Where things live

Worker: `apps/worker/src/integration/handlers/comment-automation/` (`index.ts` loop/filters/dispatch,
`ai-reply.ts`, `private-reply.ts` with `PRIVATE_REPLY_TEXT_SENDERS`, `channel-type.ts`, `live-comment.ts`);
inbound `apps/worker/src/integration/handlers/received-message.ts` (`receiveComment`); webhooks in
`integrations/{messenger,instagram,instagram-facebook,threads,tiktok}/src/handlers/webhook.ts`.
Service/queries: `packages/business/src/comment-automation/service.ts`. Schema + Zod partials:
`packages/database/src/{schema,partials}/comment-automation*.ts`. Analytics: `packages/analytics`.
Builder: `apps/builder/src/features/{fb-comments,ig-comments}/` + `threads-comments`, `tiktok-comments` + `features/shared/comment-automation/`. Tests: `apps/worker/__tests__/comment-automation.test.ts`.
Full path table: [file-map](references/file-map.md).

## Data-flow in one line

`feed webhook (verb "add") / instagram comments webhook → incomingComment → receiveComment → processCommentAutomation → (AIAgent) commentAIReply`.

## The traps (read before editing)

Condensed; the full text of every trap (reasons, file paths, edge cases) is in
[trap-details](references/trap-details.md) — find the entry by topic before touching that surface (numbers differ; trap-details keeps the original ones).

1. **Reply detection** — `parent_id` is always present and not always `post_id`; use `isCommentReply(parentId, postId, commentId)` (trailing ids). It is Meta-only: normalize non-Meta parents (TikTok `"0"` via `resolveParentCommentId`) in the channel's webhook handler, never in the shared matcher.
2. **Post ids are composite** — compare only through `normalizePostId`, never `post.value.includes(raw)`.
3. **Every skip logs AND records a miss** — `logAutomationSkipped` then `collectMiss`; a new filter needs the guard + a `commentAutomationMissReasons` value (pgEnum migration) + a `gateCases` row.
4. **AIAgent reply is not the DM auto-responder** — `value` is the agent id; use `generateAIReplyText`; never route via `processAutomatedResponse`.
5. **Dedup ledger is dual-purpose** — serves `replyOncePerUserPerPost` and `replyToUsersWhoCommentedOnOtherPosts`; existing index suffices, use `LIMIT 1` not `$count`.
6. **Five channels, one loop** (messenger, instagram, instagramFacebook, threads, tiktok) — no capability is universal; read the gate per channel, hide unsupported toggles. Matrix: [channels](references/channels.md).
7. **`private` flow replies run on the DM conversation, `public` on the comment one** — never unify (the flow silently stalls); spent private anchors gate follow-ups via `assertCommentPrivateReplyFollowUpDeliverable`; classify new step types in `STEP_PRODUCES_MESSAGE`; claim the anchor after the handler, never on `error`.
8. **`options.trackUserTags` is not a filter** — runs once per comment before the loop, stamp `contentAttributes` before incrementing (retry no-op); IG/Threads/TikTok have no tagged-user data (regex `@handle`).
9. **Instagram comment replies are text-only** — `sendComment` must throw `ChannelError(PAYLOAD_INVALID)` on attachments, never return empty `messageIds`.
10. **Instagram-via-Facebook private replies post to `/{pageId}/messages`**, not the IG node (regressed twice); keep the `send-private-reply.test.ts` guard.
11. **List columns read counters, the dialog reads events** — increments count rows returned by a conditional `UPDATE ... WHERE <col>At IS NULL RETURNING`; new outcome = timestamp column AND counter; `PRIVATE_REPLY_TEXT_SENDERS` / `commentAutomationChannelSupportsPrivateReply` duplicated on purpose (parity test).
12. **A multi-step `flow` reply is ONE reply** — any step through means delivered, not failed (`settleEvent` / `markDelivered` `clearedFailure`).
13. **Two button-payload encoders** — mirror every `encodeButtonPayload` hit on a flow-send path in each channel, not just `convertButtonsToTemplate`; carrier is `metadata`, not `CommentAnchor.automationId`.
14. **Delivery is settled at each send site** (`send-message.ts`, `send-flow-step.ts`, `executePrivateReply`, `processCommentAIReply`); only Seen/Clicked ride the event bus.
15. **Retention is per outcome** — only `failed` rows are purged; new purge predicates need a partial index; keep query and zero-fill on `resolveRangeGranularity`; parse `YYYY-MM-DD` keys as LOCAL days.
16. **A `text` public reply is a LIST but ONE reply** — read via `resolveReplyTexts`, write via `normalizeReplyTexts`, stagger by `PUBLIC_REPLY_SPACING_MS`, key form rows by `field.id`.
17. **`TiptapEditorField` in a `useFieldArray` must be keyed by `field.id`** (index keys show the removed entry's text).
18. **Declined comments go to `CommentAutomationMiss`, never the event table** — one `recordMisses` call after the loop, counter from `ON CONFLICT DO NOTHING RETURNING`, never purged without asking.
19. **Live and post automations are disjoint** — `matchPost(post, postId, isLive)`; never infer live from `post_id`; `liveCommentCapabilities` enforced in form, `withLiveCapabilities`, `withLiveCapabilityLimits`.
20. **`replyOncePerUserPerPost` is enforced by `claimDedup`**, not `findDedup`; release with `deleteDedup` when nothing dispatches.
21. **Account scope is `inboxId`, `NULL` = every account** — `findActiveAutomations` requires the comment's inbox; writes go through `assertAutomationAccount`; FK is `cascade`.
22. **An async reply type records its analytics event in TWO places** — open the row with `replyText: null`, settle in the handler, pair every `rollbackCommentDedup` with `abandonAIReply` ([add-reply-type](references/add-reply-type.md)).
23. **AI moderation runs before the reply filters; hide rules do not** — `moderateCommentWithAI` runs after the post gate and a comment it moderates is never answered (miss `moderated`); `applyHideRules` stays after the filters and hides AND answers ("DM then hide"), never move it ahead. A new hide switch needs its own `matchHideRule` value + `commentModerationRules` (pgEnum, append only); every moderation hide/delete carries `moderation: { automationId, commentId }` so the chat handler settles the log row. See the docs' "Moderation (hide rules & AI)".

## Verify

```bash
pnpm --filter worker vitest run __tests__/comment-automation.test.ts
pnpm --filter worker check-types
pnpm lint
```

Production sanity after deploy: comment on a normal post, a reel, a comment with a bare-domain link + hide-link on, and an AI Agent automation — confirm each fires or logs a clear skip reason.

## References

- [references/trap-details.md](references/trap-details.md) — full text of traps 1-5, 7-19; read the matching entry before editing that surface.
- [references/channels.md](references/channels.md) — per-channel capability matrix and Threads/TikTok specifics; read when adding or gating a capability.
- [references/file-map.md](references/file-map.md) — complete path table (analytics, miss, replay, live, stat columns); read when locating a file.
- [references/add-filter-option.md](references/add-filter-option.md) — recipe; read when adding a filter option.
- [references/add-reply-type.md](references/add-reply-type.md) — recipe plus the async-reply analytics trap; read when adding a reply type.
