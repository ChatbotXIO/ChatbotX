import { deleteComment, hideComment, likeComment } from "./comment-state"
import { sendComment } from "./outgoing-comment"

/**
 * TikTok's comment capabilities.
 *
 * `sendPrivateReply` and `editComment` are absent on purpose: TikTok has no
 * comment-anchored DM endpoint (a business cannot open a conversation, so a
 * private reply could never be delivered) and no comment-edit endpoint. Leaving
 * them off means the comment-automation loop skips them explicitly instead of
 * calling something that would always fail.
 */
export const commentHandlers = {
  sendComment,
  likeComment,
  hideComment,
  deleteComment,
}
