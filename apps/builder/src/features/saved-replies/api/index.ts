import { savedRepliesAuthorizedAPI } from "./authorized"
import savedReplyWorkspaceTokenAPIs from "./workspace-token"

export const savedRepliesAPI = {
  ...savedRepliesAuthorizedAPI,
  ...savedReplyWorkspaceTokenAPIs,
}
