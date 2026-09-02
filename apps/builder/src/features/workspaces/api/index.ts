import { workspacesAuthenticatedAPI } from "./private"
import workspaceTokenAPIs from "./workspace-token"

export const workspacesAPI = {
  ...workspaceTokenAPIs,
  ...workspacesAuthenticatedAPI,
}
