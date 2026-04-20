import { sequencesWorkspaceAuthAPI } from "./authorized"
import { sequencesPrivateAPI } from "./private"
import { sequencesWorkspaceTokenAPIs } from "./workspace-token"

export const sequencesAPI = {
  ...sequencesWorkspaceAuthAPI,
  ...sequencesPrivateAPI,
  ...sequencesWorkspaceTokenAPIs,
}
