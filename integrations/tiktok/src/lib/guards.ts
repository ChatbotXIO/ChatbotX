import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"

/**
 * The video a comment belongs to.
 *
 * Every TikTok comment write except `like` and `delete` needs it. It is read
 * from the comment message's own `contentAttributes.postId`, stamped by
 * `receiveComment` at ingest, with the comment conversation's
 * `sourceConversationId` as the fallback — that is `Conversation.sourceId`,
 * which holds the post id by the repo-wide convention but is a slot TikTok
 * also normalizes for its DM conversations, so it can legitimately be empty.
 */
export function requirePostId(
  postId: string | null | undefined,
  action: string,
): string {
  if (!postId) {
    throw new ChannelError(
      `Cannot ${action} a TikTok comment without the video id. The comment conversation must be anchored to the post it belongs to.`,
      ChannelErrorCategory.PAYLOAD_INVALID,
      { code: "tiktok_missing_video_id" },
    )
  }
  return postId
}

/**
 * The DM conversation a contact belongs to. TikTok addresses every outgoing
 * message by `conversation_id` (`recipient_type: CONVERSATION`).
 */
export function requireConversationId(
  sourceConversationId: string | null | undefined,
): string {
  if (!sourceConversationId) {
    throw new ChannelError(
      "TikTok requires a conversation_id to send messages (recipient_type: CONVERSATION). This contact has no sourceConversationId — wait for an inbound message or backfill the column.",
      ChannelErrorCategory.INVALID_RECIPIENT,
      { code: "tiktok_missing_conversation_id" },
    )
  }
  return sourceConversationId
}
