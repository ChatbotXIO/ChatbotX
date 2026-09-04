/**
 * The channels a Facebook/Instagram/Threads comment automation can run on.
 * Narrower than the workspace-wide `ChannelType` (`@chatbotx.io/utils/channel`)
 * on purpose: `instagramFacebook` distinguishes Instagram-via-Facebook-Login
 * from Instagram Login for auth/send-endpoint dispatch here, while both
 * collapse to the single `"instagram"` `ChannelType` everywhere else (flow
 * config, channel picker, settings) since contacts and flows never see that
 * distinction.
 */
export type CommentAutomationChannelType =
  | "messenger"
  | "instagram"
  | "instagramFacebook"
  | "threads"

/**
 * Whether the channel can like an incoming comment on the author's behalf.
 *
 * Meta's Graph API exposes `POST /{comment-id}/likes` for Facebook and
 * Instagram comments; the Threads API has no equivalent, so a Threads
 * automation with `likeUserComment` enabled logs an unsupported-capability
 * line instead of enqueuing a job that could only fail.
 *
 * Kept here rather than next to the dispatch (six inline lines in the
 * orchestrator) so all three "can this channel do X" answers stay greppable
 * from the channel-type module — the hide and private-reply counterparts live
 * with the code that owns their data (`hide-comments.ts`, `private-reply.ts`).
 */
export function supportsCommentLike(
  channelType: CommentAutomationChannelType,
): boolean {
  return channelType !== "threads"
}
