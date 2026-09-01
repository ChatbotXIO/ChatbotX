import { conversationsAuthenticatedAPI } from "./private"
import conversationWorkspaceTokenAPIs from "./workspace-token"

export const conversationsAPI = {
  ...conversationsAuthenticatedAPI,
  ...conversationWorkspaceTokenAPIs,
}
