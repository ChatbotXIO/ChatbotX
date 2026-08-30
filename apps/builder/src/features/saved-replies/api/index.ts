import { savedRepliesPrivateAPI } from "./private"
import savedReplyWorkspaceTokenAPIs from "./workspace-token"

export const savedRepliesAPI = {
  ...savedRepliesPrivateAPI,
  ...savedReplyWorkspaceTokenAPIs,
}
