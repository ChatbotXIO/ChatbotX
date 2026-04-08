import { sequencesChatbotAuthAPI } from "./authorized"
import sequencesWorkspaceTokenAPIs from "./workspace-token"

export const sequencesAPI = {
  ...sequencesChatbotAuthAPI,
  ...sequencesWorkspaceTokenAPIs,
}
