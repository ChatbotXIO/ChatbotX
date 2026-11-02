# File map (full)

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
| Webhook value schema | `integrations/messenger/src/schema.ts` (`messengerFeedCommentValueSchema`), `integrations/instagram{,-facebook}/src/schema.ts` (`instagramCommentEventValueSchema`) |
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
| "Process missed comments" (replay one post's last 7 days through one automation) | `apps/builder/src/features/shared/comment-automation/lib/missed-comments/` → `low` queue (`LowJobAction.replayMissedComment`) → `receiveComment` → inline `processCommentAutomation({ onlyAutomationId })`. Every enqueue in these handlers wraps its options in `withReplayPriority` (`replay-priority.ts`) — a new enqueue site that skips it lets a replay of thousands of comments crowd out live sends. See the doc's "Process missed comments" section |
| Live comments (detection, pacing) | `apps/worker/src/integration/handlers/comment-automation/live-comment.ts`, `received-message.ts` (`reserveLiveCommentDelay`); capabilities in `partials/comment-automation.ts` (`liveCommentCapabilities`) |
| Tests | `apps/worker/__tests__/comment-automation.test.ts` |
