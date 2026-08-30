import { aiAgentsAuthenticatedAPI } from "./private"
import aiAgentsWorkspaceTokenAPIs from "./workspace-token"

export const aiAgentsAPI = {
  ...aiAgentsAuthenticatedAPI,
  ...aiAgentsWorkspaceTokenAPIs,
}
