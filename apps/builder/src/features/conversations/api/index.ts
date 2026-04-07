import { conversationsAuthenticatedAPI } from "./authenticated"
import conversationWorkspaceTokenAPIs from "./workspace-token"

export const conversationsAPI = {
  ...conversationsAuthenticatedAPI,
  ...conversationWorkspaceTokenAPIs,
}
