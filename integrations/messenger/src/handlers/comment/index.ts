import { deleteComment, editComment, hideComment, likeComment } from "./actions"
import { sendComment } from "./outgoing-comment"

export const commentHandlers = {
  sendComment,
  editComment,
  deleteComment,
  likeComment,
  hideComment,
}
