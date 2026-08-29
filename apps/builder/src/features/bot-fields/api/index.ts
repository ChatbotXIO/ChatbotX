import { privateBotFieldsAPI } from "./private"
import botFieldWorkspaceTokenAPIs from "./workspace-token"

export const botFieldAPIs = {
  ...botFieldWorkspaceTokenAPIs,
  ...privateBotFieldsAPI,
}
