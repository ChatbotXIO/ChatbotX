/**
 * The channels a comment automation can run on.
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
  | "tiktok"

/**
 * Whether the channel can like an incoming comment on the author's behalf.
 *
 * Meta's Graph API exposes `POST /{comment-id}/likes` for Facebook and
 * Instagram comments, and TikTok has `business/comment/like/`; the Threads API
 * has no equivalent, so a Threads automation with `likeUserComment` enabled
 * logs an unsupported-capability line instead of enqueuing a job that could
 * only fail.
 *
 * An allowlist rather than a chain of `!==`: a channel added without a decision
 * here should default to "cannot", not inherit a capability by omission.
 *
 * Kept here rather than next to the dispatch (six inline lines in the
 * orchestrator) so all three "can this channel do X" answers stay greppable
 * from the channel-type module — the hide and private-reply counterparts live
 * with the code that owns their data (`hide-comments.ts`, `private-reply.ts`).
 */
const CHANNELS_WITH_COMMENT_LIKE = new Set<CommentAutomationChannelType>([
  "messenger",
  "instagram",
  "instagramFacebook",
  "tiktok",
])

export function supportsCommentLike(
  channelType: CommentAutomationChannelType,
): boolean {
  return CHANNELS_WITH_COMMENT_LIKE.has(channelType)
}
