import { sequencesWorkspaceAuthAPI } from "./authorized"
import { sequencesPrivateAPI } from "./private"

export const sequencesAPI = {
  ...sequencesWorkspaceAuthAPI,
  ...sequencesPrivateAPI,
}
