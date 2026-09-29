import { deleteComment, hideComment, likeComment } from "./comment"
import { sendComment } from "./outgoing-comment"
import { sendPrivateReply } from "./outgoing-private-reply"

/**
 * TikTok's comment capabilities.
 *
 * `sendPrivateReply` goes through Comment-to-Message (`direct_reply` on
 * `business/message/send/`), which addresses the DM by `comment_id` and so
 * needs no existing conversation. It is not the unconditional capability the
 * Meta channels have: TikTok only accepts it for a comment its own classifier
 * flagged as high intent (delivered on the `im_receive_high_intent_comment`
 * webhook), on a first-level comment on the business's own video, within 48
 * hours, once per comment, when the commenter had no DM with the business in
 * the past 24 hours and is over 18 — and only for Business Accounts registered
 * in Vietnam, Indonesia or Thailand with the feature enabled.
 *
 * `editComment` is still absent on purpose: TikTok has no comment-edit endpoint.
 */
export const commentHandlers = {
  sendComment,
  sendPrivateReply,
  deleteComment,
  likeComment,
  hideComment,
}
