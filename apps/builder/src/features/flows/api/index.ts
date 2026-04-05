import privateFlowsAPI from "./private"
import flowWorkspaceTokenAPIs from "./workspace-token"

const flowsAPI = {
  ...flowWorkspaceTokenAPIs,
  ...privateFlowsAPI,
}

export default flowsAPI
