import { deleteComment, editComment, hideComment, likeComment } from "./actions"
import { sendComment } from "./outgoing-comment"
import { sendPrivateReply } from "./outgoing-private-reply"

export const commentHandlers = {
  sendComment,
  sendPrivateReply,
  editComment,
  deleteComment,
  likeComment,
  hideComment,
}
