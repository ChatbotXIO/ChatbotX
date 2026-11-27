# Adding a new reply type (recipe)


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
