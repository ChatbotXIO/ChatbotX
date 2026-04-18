import { privateFlowsAPI } from "./private"
import flowWorkspaceTokenAPIs from "./workspace-token"

export const flowsAPI = {
  ...flowWorkspaceTokenAPIs,
  ...privateFlowsAPI,
}
