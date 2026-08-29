import { workspacesAuthenticatedAPI } from "./authenticated"
import workspaceTokenAPIs from "./workspace-token"

export const workspacesAPI = {
  ...workspaceTokenAPIs,
  ...workspacesAuthenticatedAPI,
}
