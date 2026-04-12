import { sequencesChatbotAuthAPI } from "./authorized"
import { sequencesPrivateAPI } from "./private"
import sequencesWorkspaceTokenAPIs from "./workspace-token"

export const sequencesAPI = {
  ...sequencesChatbotAuthAPI,
  ...sequencesPrivateAPI,
  ...sequencesWorkspaceTokenAPIs,
}
