import { savedRepliesAuthorizedAPI } from "./authorized"
import savedReplyWorkspaceTokenAPIs from "./workspace-token"

const savedRepliesAPI = {
  ...savedRepliesAuthorizedAPI,
  ...savedReplyWorkspaceTokenAPIs,
}

export default savedRepliesAPI
