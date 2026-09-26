import { hideComment } from "./comment-state"
import { sendComment } from "./outgoing-comment"

export const commentHandlers = {
  sendComment,
  hideComment,
}
