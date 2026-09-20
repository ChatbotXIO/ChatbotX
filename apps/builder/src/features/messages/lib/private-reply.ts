import type { MessageResource } from "../schema/resource"

/**
 * Whether the Inbox should offer the lock (private reply) button on a comment.
 *
 * It used to be offered on every comment of every channel, which meant clicking
 * it on Threads or TikTok threw `Channel handler "comment.sendPrivateReply" not
 * registered` — the handler simply did not exist. This is the one gate, so a
 * channel that cannot deliver a comment-anchored DM never shows the button.
 *
 * Two shapes of answer, not one:
 * - Meta channels can DM any comment, so the channel alone decides.
 * - TikTok can only DM a comment its own classifier flagged as high intent
 *   (Comment-to-Message), which is a per-MESSAGE fact, carried on the comment's
 *   `contentAttributes.tiktokHighIntent` by the webhook that reports it. A
 *   button offered on an unflagged comment would fail on nearly every click.
 * - Threads has no DM endpoint at all.
 */
const CHANNELS_WITH_COMMENT_PRIVATE_REPLY = new Set<string>([
  "messenger",
  "instagram",
  "instagramFacebook",
])

const CHANNELS_WITH_CONDITIONAL_COMMENT_PRIVATE_REPLY = new Set<string>([
  "tiktok",
])

export const canPrivateReplyToComment = (props: {
  channel: string | null | undefined
  message: Pick<MessageResource, "contentAttributes">
}): boolean => {
  const { channel, message } = props
  if (!channel) {
    return false
  }

  if (CHANNELS_WITH_CONDITIONAL_COMMENT_PRIVATE_REPLY.has(channel)) {
    const attributes = message.contentAttributes as
      | Record<string, unknown>
      | null
      | undefined
    return Boolean(attributes?.tiktokHighIntent)
  }

  return CHANNELS_WITH_COMMENT_PRIVATE_REPLY.has(channel)
}
