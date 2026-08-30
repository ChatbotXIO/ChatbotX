import { sequencesPrivateAPI } from "./private"
import { sequencesWorkspaceTokenAPIs } from "./workspace-token"

export const sequencesAPI = {
  ...sequencesPrivateAPI,
  ...sequencesWorkspaceTokenAPIs,
}
